import { useEffect, useRef, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Button, Input, Select } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { useOtpStore, type OtpPurpose } from '../store/otp';
import { INDIA_STATES, citiesForState } from '../lib/indiaGeo';
import { HD_MODEL_CATALOG } from '../lib/models';
import { reverseGeocode } from '../lib/reverseGeocode';
import {
  nameRules,
  phoneRules,
  emailRules,
  cityRules,
  optionalPincodeRules,
  requiredSelect,
  messageRules,
} from '../lib/formRules';

interface DealerOption {
  id: string;
  name: string;
  city: string;
}

// PRD §6.1.4 — Info-gate popup. 2-step modal:
//   Step 1: collect contact details + send OTP
//   Step 2: enter the 6-digit OTP, verify, persist verified token, fire onVerified

interface InfoGateModalProps {
  open: boolean;
  purpose: OtpPurpose;
  context?: {
    modelInterest?: string;
    priceRange?: string;
    /** Pre-select this dealer when the modal opens (e.g. the listing's owner). */
    preselectDealerId?: string;
  };
  /**
   * When the caller has already collected the buyer's contact details
   * (e.g. the Sell Bike full-page form), pass them here. The modal then
   * skips its own collection step, sends the OTP immediately, and goes
   * straight to OTP verification. `phone` must be a valid +91 number.
   */
  prefilled?: {
    phone: string;
    name: string;
    email: string;
    city?: string;
    pincode?: string;
    vin?: string;
    state?: string;
    location?: string;
    bikeModel?: string;
    dealerId?: string;
  };
  /**
   * QA RE-OPEN bug #2 (Edit→Resubmit OTP_RESEND_TOO_SOON):
   * When the parent modal (SellBikeModal) lets the user toggle back to
   * the enquiry form and then re-submit, this modal unmounts + remounts.
   * Without an existing-session reference the remount fires a fresh
   * /otp/send for the same phone within 30s and the server returns
   * OTP_RESEND_TOO_SOON. If the parent persists the (otpId, sentAt)
   * pair from the first send and passes it back here on remount, we
   * skip the /otp/send entirely and the user just enters the SMS code
   * they already received.
   */
  existingOtp?: { otpId: string; sentAt: number } | null;
  /** Notify parent of a successful /otp/send so it can persist the
   *  (otpId, sentAt) across the Edit→Resubmit lifecycle (see above). */
  onSent?: (session: { otpId: string; sentAt: number }) => void;
  onVerified: (data: {
    phone: string;
    name: string;
    email: string;
    city?: string;
    pincode?: string;
    vin?: string;
    state?: string;
    location?: string;
    lookingFor?: string;
    description?: string;
    dealerId?: string;
  }) => void;
  onClose?: () => void;
}

interface Step1Values {
  name: string;
  phone: string;
  email: string;
  city: string;
  pincode: string;
  vin: string;
  state: string;
  /** Free-text neighbourhood/locality, e.g. "Connaught Place". */
  location: string;
  lookingFor: string;
  description: string;
  dealerId: string;
}

// Strip everything that isn't a digit, drop the leading "91" if present, then
// cap at 10 digits and re-prefix with "+91". Keeps the field always valid as
// the user types so the Continue button can engage.
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // If user pasted "+91 9876…" or "919876…" or "+919876…", strip leading 91.
  const without91 = digits.startsWith('91') ? digits.slice(2) : digits;
  return `+91${without91.slice(0, 10)}`;
}

export function InfoGateModal({
  open,
  purpose,
  context,
  prefilled,
  existingOtp,
  onSent,
  onVerified,
  onClose,
}: InfoGateModalProps) {
  const setOtp = useOtpStore((s) => s.set);
  // Prefilled flows go straight to OTP entry — the caller has already
  // collected name + phone in their own form (e.g. Sell Bike page).
  const [step, setStep] = useState<'collect' | 'verify'>(
    prefilled ? 'verify' : 'collect',
  );
  const [profile, setProfile] = useState<Step1Values | null>(
    prefilled
      ? {
          name: prefilled.name,
          phone: prefilled.phone,
          email: prefilled.email,
          city: prefilled.city ?? '',
          pincode: prefilled.pincode ?? '',
          vin: prefilled.vin ?? '',
          state: prefilled.state ?? '',
          location: prefilled.location ?? '',
          lookingFor: prefilled.bikeModel ?? '',
          description: '',
          dealerId: prefilled.dealerId ?? '',
        }
      : null,
  );
  // QA RE-OPEN bug #2: seed otpId from the parent-preserved session so
  // Edit→Resubmit on the SellBikeModal lands here with a usable otpId
  // instead of firing a fresh /otp/send that the server rejects with
  // OTP_RESEND_TOO_SOON.
  const [otpId, setOtpId] = useState<string | null>(existingOtp?.otpId ?? null);
  const [code, setCode] = useState('');
  // QA latest (Compliance): the buyer-enquiry terms checkbox must load
  // UNCHECKED and require a deliberate click before the form can be
  // submitted. Controlled state (default false) replaces the previous
  // uncontrolled `defaultChecked` input that loaded pre-ticked.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Failsafe: if `busy` ever stays true for >15s the user gets stuck with
  // both Verify and Resend disabled (QA "buttons unclickable, network tab
  // blank" reported on the demo env). Causes include a hung request, a
  // CORS preflight that never returns, or — in earlier builds — a HTML-
  // shaped response throwing SyntaxError that escaped the catch chain.
  // Force-reset busy + surface a readable error so the buttons re-enable.
  useEffect(() => {
    if (!busy) return;
    const t = window.setTimeout(() => {
      setBusy(false);
      setError(
        (prev) =>
          prev ??
          'Request timed out. Please check your connection and try again.',
      );
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [busy]);

  // Lock body scroll while the modal is open. Critical for the SellBikeModal
  // -> InfoGateModal stacked-modal case on mobile: with body scroll free,
  // Android Chrome's touch event allocation can hand a tap on this OTP
  // modal's button to the underlying SellBikeModal's `overflow-y-auto`
  // overlay (interpreted as a scroll-start gesture). Locking body overflow
  // forces every touch to resolve against the topmost element only.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, [open]);

  // Track open transitions so we can reset modal state on every fresh open
  // (see effect below the resendCooldown declaration — placed there to avoid
  // a TDZ on setResendCooldown).
  const wasOpen = useRef(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Timestamp of the most recent successful /otp/send so the client can
  // throttle Resend clicks without hitting the server's 30-second rate
  // limit (which would surface as the red "Wait 30s before resending"
  // error on the verify step). Seeded from the parent-preserved
  // session (QA bug #2) so a remount inside the 30-second window
  // immediately knows it's within the cooldown.
  const [lastSentAt, setLastSentAt] = useState<number | null>(
    existingOtp?.sentAt ?? null,
  );

  // When the server says we're out of OTP attempts for this phone (per-
  // hour cap, daily cap, or lockout after too many failed verifications),
  // there's no otpId to verify against and clicking Resend will just trip
  // the same limit. Track the blocking error separately so the UI can
  // swap the verify input + Resend button for a clear "come back later /
  // try a different number" message instead of leaving a non-functional
  // Verify form on screen.
  const [sendBlocked, setSendBlocked] = useState<{ title: string; body: string } | null>(
    null,
  );

  // QA latest (Critical): "Resend code" was occasionally a no-op when
  // the initial send had failed silently — both otpId and lastSentAt
  // could be null, the resend handler skipped the network call, the
  // send-effect did not re-fire (no state dep changed), and the
  // button effectively did nothing. Track a brief "Code sent" badge
  // so the user always sees confirmation that a resend actually
  // fired (independent of whether the SMS itself arrives).
  const [justSent, setJustSent] = useState(false);
  useEffect(() => {
    if (!justSent) return;
    const t = window.setTimeout(() => setJustSent(false), 4000);
    return () => window.clearTimeout(t);
  }, [justSent]);

  // Friendly copy for each server-side OTP rate-limit code. Anything we
  // don't recognise falls through to the raw server message.
  function blockingMessage(code: string, raw: string):
    | { title: string; body: string }
    | null {
    switch (code) {
      case 'OTP_RESEND_LIMIT':
        return {
          title: 'OTP limit reached for this hour',
          body: 'We\'ve sent the maximum number of codes to this number in the last hour. Please try again later or use a different mobile number.',
        };
      case 'OTP_DAILY_LIMIT':
        return {
          title: 'Daily OTP limit reached',
          body: 'You\'ve reached the daily limit for OTPs on this number. Please try again tomorrow or use a different mobile number.',
        };
      case 'OTP_LOCKED':
        return {
          title: 'Too many failed attempts',
          body: 'This number is temporarily locked after too many incorrect codes. Please try again in 30 minutes.',
        };
      case 'RATE_LIMITED':
        // Per-IP rate limit on /otp/send (5/min in production NODE_ENV).
        // Without surfacing this, a tripped limit left the user on the
        // verify form with otpId=null, where every Verify click was a
        // silent no-op (QA: "Sell flow Verify button does nothing on demo").
        return {
          title: 'Too many requests',
          body: 'You\'ve hit the per-minute send limit. Please wait a minute and try again.',
        };
      default:
        return raw ? { title: 'Could not send OTP', body: raw } : null;
    }
  }

  // ⚠️  CRITICAL — DO NOT REMOVE THIS REF OR RE-ADD A `cancelled` FLAG.
  //
  // Two QA regressions (commits 3741f2a, c92a531) were caused by this code
  // path. Combined defence:
  //
  //   1. `sendInFlight` ref blocks React Strict Mode's dev double-invoke
  //      of useEffect from firing /otp/send twice. Without it, the second
  //      call hits the API's per-IP 5/min limiter (NODE_ENV=production)
  //      with 429 — first request's success state was getting masked by
  //      a `cancelled` flag flipped during Strict Mode tear-down.
  //
  //   2. `.then`/`.catch`/`.finally` MUST NOT be gated on a cancelled
  //      flag. With dedupe in place, only ONE request fires per
  //      (phone, purpose) — its result MUST land. Adding back a
  //      cancelled flag will make `.finally` skip `setBusy(false)` →
  //      modal stuck on "Verifying…" forever (QA screenshot proof).
  //
  // The component instance survives Strict Mode's fake unmount/remount,
  // so state writes always reach the right component. There is NO
  // legitimate reason to re-introduce the cancelled pattern here.
  //
  // Regression test: `e2e/info-gate-modal-strictmode.mjs` replays this
  // exact lifecycle and asserts `busy=false` + `otpId` is set after
  // the request completes. Run before any change to this effect.
  //
  // Key shape captures phone+purpose so a legitimate change (Edit
  // details → resubmit with new phone) re-arms the send.
  const sendInFlight = useRef<string | null>(null);

  // When prefilled, fire the OTP send as soon as the modal opens. Done in a
  // useEffect (not during render) so React doesn't tear-render and lose the
  // resulting otpId — that's why the previous in-render version sometimes
  // left the verify button click without an otpId to verify against.
  //
  // The guard intentionally drops `error` from the deps — the previous
  // version refused to retry once `error` was set, which made a transient
  // network blip a permanent dead-end. The Resend Code button on the
  // verify step now clears `error` + `otpId` and lets this effect re-fire.
  useEffect(() => {
    // Either path: prefilled (caller passed phone in props) OR collect
    // step finished + we have a profile in state. Previously gated on
    // !prefilled which made Resend Code a no-op for the buyer-enquiry
    // collect→verify flow.
    const phone = prefilled?.phone ?? profile?.phone;
    if (!open || !phone || otpId || busy) return;
    // Strict-Mode-safe dedupe: if a /otp/send for this exact (phone, purpose)
    // pair is already in flight from a sibling effect run, skip. Cleared in
    // .finally so a legitimate retry (Resend Code, modal re-open) re-arms.
    const sendKey = `${phone}|${purpose}`;
    if (sendInFlight.current === sendKey) return;
    sendInFlight.current = sendKey;
    setBusy(true);
    // NOTE: we deliberately do NOT gate the .then/.catch/.finally on a
    // `cancelled` flag any more. With the StrictMode-dedupe ref above,
    // only ONE /otp/send fires per (phone, purpose) — its result MUST
    // land regardless of which Strict-Mode effect run "owns" the
    // closure. Previously the cancelled-gate skipped setOtpId AND
    // setBusy(false) when Strict Mode tore down the first run, leaving
    // the modal stuck on "Verifying..." with no otpId. The component
    // instance is the same across Strict-Mode tear-down/remount, so
    // these state writes always go to the right component.
    api<{ otpId: string }>('/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone, purpose }),
    })
      .then((res) => {
        const sentAt = Date.now();
        setOtpId(res.otpId);
        setLastSentAt(sentAt);
        setError(null);
        setJustSent(true);
        // QA bug #2: hand the session back to the parent so a later
        // Edit→Resubmit can re-mount this modal with the same otpId
        // (avoids the new-mount → /otp/send → OTP_RESEND_TOO_SOON loop).
        onSent?.({ otpId: res.otpId, sentAt });
      })
      .catch((e) => {
        // QA RE-OPEN bug #4/#6: the server now returns the existing
        // otpId on the Edit→Resubmit path instead of throwing
        // OTP_RESEND_TOO_SOON, so the modal lands cleanly on verify
        // with a usable otpId and the user enters the SMS code they
        // already received. OTP_RESEND_TOO_SOON now only fires when
        // the user explicitly taps Resend before the 30s window
        // elapses — surfaced as a Resend-button countdown only, never
        // as a blocking error or popup.
        if (e instanceof ApiError && e.code === 'OTP_RESEND_TOO_SOON') {
          if (lastSentAt !== null) {
            setResendCooldown(30);
          }
          setError(null);
          return;
        }
        // Hard rate-limit / lockout: there's no otpId to verify against,
        // and Resend will just trip the same limit. Show a blocking
        // message instead of leaving the verify form visible with an
        // unactionable red error band.
        if (
          e instanceof ApiError &&
          (e.code === 'OTP_RESEND_LIMIT' ||
            e.code === 'OTP_DAILY_LIMIT' ||
            e.code === 'OTP_LOCKED' ||
            e.code === 'RATE_LIMITED')
        ) {
          const msg = blockingMessage(e.code, e.message);
          if (msg) {
            setSendBlocked(msg);
            setError(null);
            return;
          }
        }
        setError(e instanceof ApiError ? e.message : 'Could not send OTP');
      })
      .finally(() => {
        // ALWAYS reset busy — see the note above the api() call. Without
        // this unconditional reset, Strict Mode's tear-down between the
        // two effect runs flipped the (now-removed) cancelled flag and
        // the modal stuck on "Verifying..." forever (QA: "without
        // typing OTP it's showing Verifying…").
        setBusy(false);
        // Clear the in-flight ref so legitimate retries (Resend Code,
        // modal re-open after close, Edit details with new phone) can
        // re-arm. Doing it in finally (not after success) keeps the
        // dedupe window open until the request actually returns.
        sendInFlight.current = null;
      });
    // No cleanup function — the StrictMode dedupe ref above handles the
    // dev-mode double-invoke, and the request is fire-and-forget within
    // the same component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefilled?.phone, profile?.phone, purpose, otpId]);

  // Visible "Resend in Ns" countdown. NOT armed on the initial OTP send
  // (a buyer who just landed on the verify step shouldn't see a "wait
  // 30s" timer for an SMS they haven't checked yet — that was the
  // original QA complaint). Only set when the user actually clicks
  // Resend within the server's 30-second window — we show the remaining
  // seconds and intentionally skip the /otp/send call so the server's
  // rate-limit error never surfaces.
  const [resendCooldown, setResendCooldown] = useState(0);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    // setTimeout (not setInterval) so we schedule exactly one tick per
    // render — when the effect re-runs after each decrement, the old
    // timeout is cleared and the next one is scheduled fresh.
    const t = window.setTimeout(() => {
      setResendCooldown((n) => Math.max(0, n - 1));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  // Reset the modal back to its initial step every time it opens. The
  // component instance is preserved across open/close cycles by the parent
  // (`if (!open) return null` skips the JSX but the React element / hook
  // state survive), so `step` would otherwise stay on whatever value it
  // last had — i.e. a buyer who reached the 'verify' step, closed the
  // modal, and then clicked Visit Dealer again would see the OTP entry
  // instead of the enquiry form. QA: "When a user fills out the Buyer
  // Enquiry form … and then clicks the Visit Dealer button again, the
  // enquiry form should open normally". Prefilled callers (Sell Bike)
  // intentionally skip the collect step — for those we re-arm the verify
  // step and clear the previous attempt's otpId so the auto-send effect
  // fires fresh.
  useEffect(() => {
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      if (prefilled) {
        setStep('verify');
      } else {
        setStep('collect');
        setProfile(null);
      }
      // QA bug #2 (Edit→Resubmit): when the parent passes a still-valid
      // existingOtp session, seed otpId + lastSentAt from it instead of
      // nuking them — that way the auto-send effect short-circuits
      // (otpId already set) and the user lands on a usable verify form
      // immediately. Without this branch the remount cleared otpId,
      // fired /otp/send within the 30s window, and the server's
      // OTP_RESEND_TOO_SOON response left the modal in a broken state
      // (no otpId, Verify button disabled).
      if (existingOtp) {
        setOtpId(existingOtp.otpId);
        setLastSentAt(existingOtp.sentAt);
      } else {
        setOtpId(null);
        setLastSentAt(null);
      }
      setCode('');
      setError(null);
      setSendBlocked(null);
      setBusy(false);
      setResendCooldown(0);
      // QA: terms checkbox always re-loads unchecked on a fresh open.
      setTermsAccepted(false);
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resendOtp = async () => {
    // Diagnostic trace — same rationale as submitVerify above (QA #4).
    // eslint-disable-next-line no-console
    console.log('[OTP] Resend clicked', {
      busy,
      resendCooldown,
      lastSentAt,
      hasOtpId: !!otpId,
    });
    if (busy || resendCooldown > 0) return;

    const phone = prefilled?.phone ?? profile?.phone;
    if (!phone) {
      setError('Phone number missing — close this dialog and try again.');
      return;
    }

    // QA latest (Critical): ALWAYS fire a fresh /otp/send when the
    // user clicks Resend. Previously when (a) otpId+lastSentAt were
    // both null after a silent first-send failure or (b) the parent
    // had remounted us with a null session, setOtpId(null) was a
    // no-op state write and the auto-send effect never re-ran — the
    // button looked dead. Direct API call here removes that
    // dependency on effect-re-fire and always gives the user a
    // confirmation (the new "Code sent" badge fires either way).
    //
    // Server-side reverse-index: if we're inside the 30s window the
    // server returns the EXISTING otpId, not OTP_RESEND_TOO_SOON,
    // so this never spams a new SMS even on rapid clicks. The
    // cooldown UI still kicks in below to gate further clicks.
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ otpId: string }>('/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone, purpose }),
      });
      const sentAt = Date.now();
      setOtpId(res.otpId);
      setLastSentAt(sentAt);
      setJustSent(true);
      // Arm the 30s cooldown so a tap-happy buyer can't fire 10
      // sends per minute against the server's rate-limit.
      setResendCooldown(30);
      onSent?.({ otpId: res.otpId, sentAt });
    } catch (e) {
      // OTP_RESEND_TOO_SOON — the prior send is still active.
      // Surface the cooldown UI instead of an error banner.
      if (e instanceof ApiError && e.code === 'OTP_RESEND_TOO_SOON') {
        const elapsedSec = lastSentAt ? (Date.now() - lastSentAt) / 1000 : 0;
        setResendCooldown(Math.max(1, Math.ceil(30 - elapsedSec)));
        // Treat as a quiet success — the existing OTP is still valid.
        setJustSent(true);
        setError(null);
      } else if (
        e instanceof ApiError &&
        (e.code === 'OTP_RESEND_LIMIT' ||
          e.code === 'OTP_DAILY_LIMIT' ||
          e.code === 'OTP_LOCKED' ||
          e.code === 'RATE_LIMITED')
      ) {
        const msg = blockingMessage(e.code, e.message);
        if (msg) setSendBlocked(msg);
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not resend OTP');
      }
    } finally {
      setBusy(false);
    }
  };

  // Dealers list for the "Choose Dealer" select. Loaded only when the modal
  // is open so we don't fetch eagerly on every page mount.
  const dealersQuery = useQuery({
    enabled: open,
    queryKey: ['public-dealers-options'],
    queryFn: () =>
      api<DealerOption[]>('/dealers?lat=20.5937&lng=78.9629&radius=500'),
    staleTime: 5 * 60 * 1000,
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isValid },
  } = useForm<Step1Values>({
    mode: 'onChange',
    defaultValues: {
      name: '',
      phone: '+91',
      email: '',
      city: '',
      pincode: '',
      vin: '',
      state: '',
      location: '',
      lookingFor: '',
      description: '',
      dealerId: context?.preselectDealerId ?? '',
    },
  });

  // Watch the selected state so the City dropdown can filter to its
  // matching cities. Empty state → empty city list (placeholder only).
  const selectedState = useWatch({ control, name: 'state' });
  const cityOptions = citiesForState(selectedState ?? '');

  // Show the richer "BUYER ENQUIRY" form layout on listing-enquiry purpose;
  // the leaner gate is fine for general info-gate / trade-in.
  const isBuyerEnquiry = purpose === 'ENQUIRY';

  if (!open) return null;

  const submitDetails = async (values: Step1Values) => {
    setBusy(true);
    setError(null);
    try {
      const cleanPhone = normalisePhone(values.phone);
      const res = await api<{ otpId: string }>('/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: cleanPhone, purpose }),
      });
      setProfile({ ...values, phone: cleanPhone });
      setOtpId(res.otpId);
      setLastSentAt(Date.now());
      // QA latest: fire the green "Code sent" badge on the buyer
      // (collect → verify) flow too, so it matches the seller
      // (prefilled) flow which sets justSent in its auto-send effect.
      // Without this the buyer modal only ever showed the persistent
      // yellow banner.
      setJustSent(true);
      setStep('verify');
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.code === 'OTP_RESEND_LIMIT' ||
          e.code === 'OTP_DAILY_LIMIT' ||
          e.code === 'OTP_LOCKED')
      ) {
        const msg = blockingMessage(e.code, e.message);
        if (msg) {
          // Persist the entered profile + flip to verify so the user lands
          // on the blocking-message panel rather than an unactionable red
          // band over the collect form.
          setProfile({ ...values, phone: normalisePhone(values.phone) });
          setSendBlocked(msg);
          setStep('verify');
          return;
        }
      }
      setError(e instanceof ApiError ? e.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async () => {
    // Diagnostic trace so QA can see in the Console exactly why a Verify
    // tap that "did nothing" actually exited (QA #5 was reported multiple
    // times across rounds — the silent early-return below was the cause).
    // eslint-disable-next-line no-console
    console.log('[OTP] Verify clicked', {
      hasOtpId: !!otpId,
      hasProfile: !!profile,
      codeLength: code.length,
      busy,
    });
    if (!otpId || !profile) {
      // Was: silent return — left the user staring at an unresponsive button.
      // Now: surface a concrete error so they know to use Resend Code or
      // re-open the modal. Most common cause: /otp/send failed silently
      // (rate-limited, network blip) so otpId never got set even though
      // the modal landed on the verify step.
      setError(
        !otpId
          ? 'OTP not yet sent — tap "Resend code" to request a new one.'
          : 'Session lost. Please close and re-open this dialog.',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ verifiedToken: string }>('/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ otpId, code }),
      });
      // Persist the buyer's full identity (not just phone) so the
      // "alreadyVerified" shortcut on subsequent listings can submit
      // a real lead with the actual name/email, not placeholders.
      setOtp(
        res.verifiedToken,
        { phone: profile.phone, name: profile.name, email: profile.email },
        purpose,
      );
      onVerified({
        phone: profile.phone,
        name: profile.name,
        email: profile.email,
        city: profile.city || undefined,
        pincode: profile.pincode || undefined,
        vin: profile.vin || undefined,
        state: profile.state || undefined,
        location: profile.location || undefined,
        lookingFor: profile.lookingFor || undefined,
        description: profile.description || undefined,
        dealerId: profile.dealerId || undefined,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    // z-[60] (one level above the standard z-50 used by every other modal
    // in the buyer SPA) is critical for the prefilled flow where this OTP
    // modal stacks ON TOP of a caller modal — e.g. SellBikeModal opens its
    // own `fixed inset-0 z-50` sheet, then mounts this component as a
    // sibling. With both at z-50, Android Chrome's touch-event allocation
    // routes taps to the EARLIER fixed scroll container (the underlying
    // SellBikeModal's overflow-y-auto) instead of the visually-on-top OTP
    // modal — Verify and Resend look unresponsive on mobile. Bumping to
    // z-60 puts OTP unambiguously on top for both paint AND hit-testing.
    // QA: "Verify+Resend not working on Sell Your Motorcycle (works on Buy)".
    //
    // QA latest (overflow): match the seller modal's containment — the
    // overlay centres the card and the CARD itself caps at 90vh + scrolls
    // internally, so the long Buyer Enquiry form (description textarea,
    // consent checkbox, CANCEL / SEND ENQUIRY footer) never spills past
    // the viewport fold on a standard desktop. Previously the whole
    // backdrop scrolled (overflow-y-auto + my-auto) which pushed the
    // footer CTAs out of view.
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center px-3 sm:px-4 py-6">
      <div
        className={`bg-hd-white border-t-4 border-hd-orange ${
          isBuyerEnquiry && step === 'collect' ? 'max-w-xl' : 'max-w-md'
        } w-full p-4 sm:p-6 shadow-xl max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="font-subhead uppercase tracking-subhead text-text-on-light text-xl">
            {step === 'collect'
              ? isBuyerEnquiry
                ? 'Buyer Enquiry'
                : 'Almost There'
              : 'Verify OTP'}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-gray-500 hover:text-text-on-light text-sm"
            >
              ✕
            </button>
          )}
        </div>
        {!isBuyerEnquiry && (
          <p className="text-gray-600 text-sm mt-2">
            {step === 'collect'
              ? 'Quick details so the dealer can reach you. We send a one-time code to confirm your number.'
              : `We sent a 6-digit code to ${profile?.phone}. Enter it below.`}
          </p>
        )}
        {isBuyerEnquiry && step === 'verify' && (
          <p className="text-gray-600 text-sm mt-2">
            {`We sent a 6-digit code to ${profile?.phone}. Enter it below.`}
          </p>
        )}

        {step === 'collect' && (
          // QA latest: every input + select gets a heavy 1.5px solid
          // black border + sharp corners via descendant variants,
          // matching the Figma spec ("border: 1.5px solid #000000").
          // Targets <input> and <select> children of this form only —
          // doesn't affect the OTP code input on the verify step.
          <form
            onSubmit={handleSubmit(submitDetails)}
            className={`mt-6 [&_input]:!border-[1.5px] [&_input]:!border-hd-black [&_select]:!border-[1.5px] [&_select]:!border-hd-black [&_textarea]:!border-[1.5px] [&_textarea]:!border-hd-black ${isBuyerEnquiry ? 'space-y-4' : 'space-y-3'}`}
            noValidate
          >
            <Labelled label="Full Name" required error={errors.name?.message} show={isBuyerEnquiry}>
              <Input
                placeholder={isBuyerEnquiry ? 'Mohit Tai' : 'Full name'}
                aria-invalid={Boolean(errors.name)}
                maxLength={100}
                {...register('name', nameRules)}
              />
            </Labelled>

            <div className={isBuyerEnquiry ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
              <Labelled label="Phone Number" required error={errors.phone?.message} show={isBuyerEnquiry}>
                <Controller
                  control={control}
                  name="phone"
                  rules={phoneRules}
                  render={({ field }) => (
                    <Input
                      inputMode="tel"
                      maxLength={13}
                      placeholder="+91XXXXXXXXXX"
                      aria-invalid={Boolean(errors.phone)}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => field.onChange(normalisePhone(e.target.value))}
                    />
                  )}
                />
              </Labelled>

              {isBuyerEnquiry && (
                <Labelled label="Email ID" required error={errors.email?.message} show>
                  <Input
                    type="email"
                    placeholder="Enter email id"
                    aria-invalid={Boolean(errors.email)}
                    maxLength={254}
                    {...register('email', emailRules)}
                  />
                </Labelled>
              )}
            </div>

            {!isBuyerEnquiry && (
              <Labelled label="Email ID" required error={errors.email?.message} show={false}>
                <Input
                  type="email"
                  placeholder="Email"
                  aria-invalid={Boolean(errors.email)}
                  maxLength={254}
                  {...register('email', emailRules)}
                />
              </Labelled>
            )}

            {/* Buyer Enquiry layout per Figma /Customer/Frame 173.png — 2-col:
                  row A: LOCATION | STATE
                  row B: CITY     | PIN CODE
                Location is a free-text neighbourhood input with a locator
                affordance; State + City are dependent dropdowns. VIN is
                intentionally absent — that field belongs to the SELLER
                trade-in form (Frame 28), not the buyer enquiry. */}
            {isBuyerEnquiry ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Labelled label="Location" show>
                    <LocationInput
                      register={register('location')}
                      busy={geoBusy}
                      onUseGeolocation={() => {
                        if (!navigator.geolocation) return;
                        setGeoBusy(true);
                        setGeoError(null);
                        navigator.geolocation.getCurrentPosition(
                          async (pos) => {
                            try {
                              const r = await reverseGeocode(
                                pos.coords.latitude,
                                pos.coords.longitude,
                              );
                              // Prefer the human-readable locality; fall back to
                              // raw coords if BigDataCloud returned nothing.
                              setValue('location', r.locality || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, {
                                shouldValidate: true,
                              });
                              if (r.state) {
                                setValue('state', r.state, { shouldValidate: true });
                                if (r.city) {
                                  setValue('city', r.city, { shouldValidate: true });
                                } else {
                                  setValue('city', '', { shouldValidate: true });
                                }
                              }
                              if (r.pincode) {
                                setValue('pincode', r.pincode, { shouldValidate: true });
                              }
                              if (r.countryCode && r.countryCode !== 'IN') {
                                setGeoError('Outside India — please enter address manually.');
                              }
                            } catch (e) {
                              setGeoError(e instanceof Error ? e.message : 'Could not resolve location');
                            } finally {
                              setGeoBusy(false);
                            }
                          },
                          (err) => {
                            setGeoBusy(false);
                            // Code 1 = permission denied (silent — user choice).
                            if (err.code !== 1) setGeoError('Could not get your location');
                          },
                          { timeout: 8000, maximumAge: 60_000 },
                        );
                      }}
                    />
                    {geoError && (
                      <p className="text-[10px] text-warning mt-1">{geoError}</p>
                    )}
                  </Labelled>
                  <Labelled label="State" required error={errors.state?.message} show>
                    <Select
                      aria-invalid={Boolean(errors.state)}
                      {...register('state', {
                        ...requiredSelect('a state'),
                        onChange: () => {
                          // Re-pick city if the previous one isn't valid for the
                          // newly-chosen state — prevents stale invalid pairs.
                          setValue('city', '', { shouldValidate: true });
                        },
                      })}
                    >
                      <option value="">Select state</option>
                      {INDIA_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Labelled label="City" required error={errors.city?.message} show>
                    <Select
                      aria-invalid={Boolean(errors.city)}
                      disabled={!selectedState}
                      {...register('city', requiredSelect('a city'))}
                    >
                      <option value="">
                        {selectedState ? 'Select city' : 'Pick a state first'}
                      </option>
                      {cityOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Labelled>
                  <Labelled label="Pin Code" error={errors.pincode?.message} show>
                    <Input
                      placeholder="110053"
                      inputMode="numeric"
                      maxLength={6}
                      aria-invalid={Boolean(errors.pincode)}
                      {...register('pincode', optionalPincodeRules)}
                    />
                  </Labelled>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Location" error={errors.city?.message} show={false}>
                  <Input
                    placeholder="Choose location"
                    aria-invalid={Boolean(errors.city)}
                    maxLength={60}
                    {...register('city', cityRules)}
                  />
                </Labelled>
                <Labelled label="Pincode" error={errors.pincode?.message} show={false}>
                  <Input
                    placeholder="Pincode (6 digits)"
                    inputMode="numeric"
                    maxLength={6}
                    aria-invalid={Boolean(errors.pincode)}
                    {...register('pincode', optionalPincodeRules)}
                  />
                </Labelled>
              </div>
            )}

            {isBuyerEnquiry && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* QA latest: "Looking For" is mandatory to generate
                    an enquiry ticket — gets the red asterisk + a
                    required validator so it counts toward isValid and
                    blocks SEND ENQUIRY until a model is picked. */}
                <Labelled label="Looking For" required error={errors.lookingFor?.message} show>
                  <Select
                    aria-invalid={Boolean(errors.lookingFor)}
                    {...register('lookingFor', requiredSelect('a model'))}
                    defaultValue=""
                  >
                    <option value="">Select a model</option>
                    {HD_MODEL_CATALOG.map((g) => (
                      <optgroup key={g.family} label={g.family}>
                        {g.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Labelled>
                <Labelled label="Choose Dealer" required error={errors.dealerId?.message} show>
                  {/* Auto-selected from the listing context, but the user can
                      override — useful when the listing's dealer is far and
                      the buyer would prefer a closer one. The lead is still
                      tied to the listing's dealer for inventory ownership;
                      the chosen dealer flows through as a routing preference. */}
                  <Select
                    {...register('dealerId', {
                      validate: (v) =>
                        Boolean(v) ||
                        Boolean(context?.preselectDealerId) ||
                        'Please choose a dealer',
                    })}
                    aria-label="Choose dealer"
                    aria-describedby={context?.preselectDealerId ? 'dealer-preselect-hint' : undefined}
                    aria-invalid={Boolean(errors.dealerId)}
                    disabled={dealersQuery.isLoading}
                  >
                    <option value="">
                      {dealersQuery.isLoading ? 'Loading…' : 'Choose Dealer'}
                    </option>
                    {dealersQuery.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.city}
                      </option>
                    ))}
                  </Select>
                  {/* QA latest: "Auto-selected from this listing — change
                      if you prefer another dealer" instructional subtext
                      removed per Figma. The dealer dropdown stays
                      pre-populated; the buyer can still change it. */}
                </Labelled>
              </div>
            )}

            {isBuyerEnquiry && (
              <Labelled label="Description" error={errors.description?.message} show>
                <textarea
                  rows={3}
                  placeholder="Add description here…"
                  maxLength={1000}
                  aria-invalid={Boolean(errors.description)}
                  className="w-full bg-hd-white border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hd-orange/50"
                  {...register('description', messageRules)}
                />
              </Labelled>
            )}

            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger px-3 py-2 rounded">
                {error}
              </div>
            )}
            {/* QA latest (Compliance): controlled checkbox — loads
                UNCHECKED, requires a deliberate click. Checked state
                fills brand orange #ff5500 with a white tick (was a
                white fill with black tick), matching the seller
                enquiry form's accent token. */}
            <p className="text-xs text-gray-500">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mr-1.5 align-middle h-4 w-4 appearance-none border-[1.5px] border-hd-black checked:bg-[#ff5500] checked:border-[#ff5500] checked:after:content-['✓'] checked:after:text-white checked:after:text-xs checked:after:leading-none checked:after:flex checked:after:items-center checked:after:justify-center"
                aria-label="I have read and understood the Terms and Conditions and Privacy Policy"
              />
              I have read &amp; understood the{' '}
              <a href="/terms" className="text-hd-orange hover:underline">
                Terms &amp; Conditions
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-hd-orange hover:underline">
                Privacy Policy
              </a>
              .
            </p>
            {/* QA latest: both buttons UPPERCASE — "CANCEL" / "SEND
                ENQUIRY" with sharp corners + bold weight. The Cancel
                button gets the black-outline treatment to match the
                rugged brand voice. */}
            <div
              className={`flex ${isBuyerEnquiry ? 'justify-end gap-3' : ''}`}
            >
              {isBuyerEnquiry && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="border-2 border-hd-black px-8 py-2.5 font-subhead font-bold uppercase tracking-subhead text-xs text-hd-black hover:bg-hd-black hover:text-hd-white transition"
                >
                  CANCEL
                </button>
              )}
              <button
                type="submit"
                // QA latest: SEND ENQUIRY stays disabled until BOTH
                // (a) every required field validates (RHF isValid,
                // mode:onChange) AND (b) the legal terms checkbox is
                // ticked — mirroring the seller enquiry form's strict
                // validation flow. Previously ticking the checkbox
                // alone enabled the button even while Full Name /
                // Phone / Email / State / City were empty with active
                // red errors. The non-buyer (general/trade-in) collect
                // path keeps its own handling and isn't gated here.
                disabled={busy || (isBuyerEnquiry && (!isValid || !termsAccepted))}
                className={`bg-hd-orange text-hd-black font-subhead font-bold uppercase tracking-subhead text-xs px-8 py-2.5 hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed ${isBuyerEnquiry ? '' : 'w-full'}`}
              >
                {busy ? 'SENDING OTP…' : isBuyerEnquiry ? 'SEND ENQUIRY' : 'CONTINUE'}
              </button>
            </div>
          </form>
        )}

        {step === 'verify' && sendBlocked && (
          // Hard rate-limit (per-hour cap, daily cap, or temporary lockout
          // after too many failed OTPs). No otpId to verify against and
          // Resend would just trip the same limit — swap the input + verify
          // form for a clear blocking-message panel and keep only the
          // Edit details / Close affordance so the user has a way out.
          <div className="mt-6 space-y-4">
            <div className="bg-warning/10 border border-warning/40 p-4">
              <p className="font-subhead uppercase tracking-subhead text-sm text-warning">
                {sendBlocked.title}
              </p>
              <p className="text-sm text-gray-700 mt-2 leading-relaxed">
                {sendBlocked.body}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSendBlocked(null);
                if (prefilled) {
                  onClose?.();
                } else {
                  setStep('collect');
                }
              }}
              className="text-xs text-gray-600 hover:text-hd-orange w-full"
            >
              ← Edit details
            </button>
          </div>
        )}

        {step === 'verify' && !sendBlocked && (
          <div className="mt-6 space-y-3">
            {/* QA latest (Medium — re-apply, surgical scope): the
                tracking-[0.5em] utility was being applied to BOTH
                typed digits AND the empty-state placeholder, stretching
                "6-digit code" into "6 - d i g i t   c o d e" by
                inserting visual gaps between every glyph. Fix:
                  • Wide tracking applied ONLY when code has a value
                    (inline style; CSS placeholder pseudo-element
                    inherits from input but can be overridden).
                  • placeholder:tracking-normal explicitly resets the
                    placeholder back to default tracking even when
                    the typed-state tracking is in effect.
                  • Placeholder font drops to text-base + font-normal
                    so it reads as a clean caption instead of an
                    oversized stretched block.
                  • font-body keeps 1903 Sans on both states. */}
            <Input
              placeholder="6-digit code"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={code ? { letterSpacing: '0.5em' } : undefined}
              className="text-center text-xl font-body font-bold placeholder:tracking-normal placeholder:text-base placeholder:font-normal"
            />
            {/* QA latest: single light-green "Code sent" confirmation
                box — identical copy + treatment across BOTH the buyer
                (collect → verify) and seller (prefilled) flows. Renders
                on verify-step entry and on every Resend, then auto-fades
                after 4s (justSent timer) so it doesn't permanently
                occupy modal space. The previous persistent yellow
                "OTP has been sent…" banner is dropped per QA — the
                green box + the Resend button below carry the full
                guidance. */}
            {!error && justSent && (
              <div className="text-emerald-900 text-[13px] bg-emerald-50 border border-emerald-200 px-3 py-2.5 leading-relaxed flex items-center gap-2 transition-opacity">
                <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                  &#10003;
                </span>
                <span>
                  <strong>Code sent</strong> to your mobile number. Check your SMS
                  and enter the 6-digit code above.
                </span>
              </div>
            )}
            {error && (
              <div className="text-danger text-sm bg-danger/10 border border-danger px-3 py-2 rounded">
                {error}
              </div>
            )}
            <Button
              type="button"
              onClick={submitVerify}
              // Verify gated on (a) a 6-digit code typed, (b) no in-flight
              // request, and (c) a real otpId from a successful /otp/send.
              // The third gate prevents the misleading "OTP not yet sent"
              // error path that surfaced when the buyer clicked Verify
              // before the send completed (or after it failed silently).
              disabled={code.length !== 6 || busy || !otpId}
              className="w-full"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
            {/* Resend Code — gated by a 30s cooldown so a tap-happy buyer
                doesn't spam /otp/send and trip the rate limit. After the
                countdown the link enables; clicking nukes the otpId so the
                send-effect re-fires with the same phone. */}
            <button
              type="button"
              onClick={resendOtp}
              disabled={resendCooldown > 0 || busy}
              className="text-xs text-gray-600 hover:text-hd-orange w-full disabled:text-gray-400 disabled:hover:text-gray-400"
            >
              {resendCooldown > 0
                ? `Didn't get it? Resend in ${resendCooldown}s`
                : "Didn't get it? Resend code"}
            </button>
            <button
              type="button"
              onClick={() => {
                // Prefilled flows (e.g. SellBikeModal) collected details in
                // the caller's own form. Routing to this modal's internal
                // collect step would show a DIFFERENT form than the one
                // the user originally filled, dropping their bike-model /
                // VIN / location fields. Close instead — the parent's
                // form is still mounted underneath with the user's data
                // intact and becomes interactive again as soon as the
                // OTP overlay dismisses.
                if (prefilled) {
                  onClose?.();
                } else {
                  setStep('collect');
                }
              }}
              className="text-xs text-gray-600 hover:text-hd-orange w-full"
            >
              ← Edit details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationInput({
  register,
  onUseGeolocation,
  busy = false,
}: {
  register: ReturnType<ReturnType<typeof useForm<Step1Values>>['register']>;
  onUseGeolocation: () => void;
  busy?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        placeholder={busy ? 'Locating…' : 'Choose location'}
        {...register}
        className="pr-10"
        readOnly={busy}
      />
      <button
        type="button"
        onClick={onUseGeolocation}
        disabled={busy}
        aria-label="Use my current location"
        className={`absolute right-2 top-1/2 -translate-y-1/2 text-hd-orange hover:brightness-110 ${
          busy ? 'animate-pulse' : ''
        }`}
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="1" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="23" />
          <line x1="1" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="23" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function Field({
  error,
  hint,
  children,
}: {
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      {error ? (
        <p className="text-xs text-danger mt-1">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500 mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

// Wraps a field with the freeze design's mini-label-above pattern. When `show`
// is false (compact mode), the label is hidden and we fall back to the bare
// Field wrapper that just shows error/hint underneath.
function Labelled({
  label,
  error,
  show = true,
  required = false,
  hint,
  children,
}: {
  label: string;
  error?: string;
  show?: boolean;
  /** Render a small red asterisk after the label for required fields so
      users learn the requirement up-front instead of via a submit error. */
  required?: boolean;
  /** Optional grey caption rendered under the field (e.g. format hints). */
  hint?: string;
  children: React.ReactNode;
}) {
  if (!show) return <Field error={error}>{children}</Field>;
  return (
    <div>
      <label className="block font-subhead uppercase tracking-subhead text-[11px] text-gray-600 mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
    </div>
  );
}
