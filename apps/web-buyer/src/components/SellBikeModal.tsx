import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, Select, checkPincodeMatch } from '@hd-cpo/ui';
import { api, ApiError } from '../lib/api';
import { InfoGateModal } from './InfoGateModal';
import { HD_MODEL_CATALOG } from '../lib/models';
import { INDIA_STATES, citiesForState } from '../lib/indiaGeo';
import { reverseGeocode } from '../lib/reverseGeocode';
import { useSellBikeStore } from '../store/sellBike';
import { formatLeadId } from '../lib/leadId';
import { CopyRefButton } from './CopyRefButton';
import {
  nameRules,
  phoneRules,
  toApiPhone,
  emailRules,
  vinRules,
  optionalPincodeRules,
  requiredSelect,
  termsCheckboxRules,
  sanitizeAlpha,
  sanitizeDigits,
} from '../lib/formRules';

// "Tell Us About Your Bike" trade-in form per Figma /Customer/Frame 28.png.
// Mounted globally and triggered via useSellBikeStore so any nav link can
// open it. Two-step flow:
//   1. This modal collects all bike + seller details (single screen).
//   2. On Send Enquiry, an InfoGateModal opens for OTP-only verification —
//      we never re-ask for name/phone/email here.
//
// Form lifts into the InfoGateModal via the `prefilled` prop; conditional
// render (`{otpOpen && …}`) ensures the inner modal mounts fresh each time
// so its useState initialiser sees `prefilled` set.

interface FormValues {
  username: string;
  bikeModel: string;
  vin: string;
  phone: string;
  email: string;
  location: string;
  state: string;
  city: string;
  pincode: string;
  dealerId: string;
  // Client feedback #16: "Looking for upgrade?" field.
  upgradeTimeline: string;
  acceptedTerms: boolean;
}

interface DealerOption {
  id: string;
  name: string;
  city: string;
  pincode: string;
}

function normalisePhone(raw: string): string {
  // QA: format as "+91 XXXXXXXXXX" with a single visible space between
  // the country code and the subscriber number. Strip space before
  // sending to the API via toApiPhone() (see formRules).
  const digits = raw.replace(/\D/g, '');
  const without91 = digits.startsWith('91') ? digits.slice(2) : digits;
  const ten = without91.slice(0, 10);
  return ten ? `+91 ${ten}` : '+91 ';
}

export function SellBikeModal() {
  const { open, closeSellBike } = useSellBikeStore();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
    getValues,
    setValue,
    control,
    reset,
  } = useForm<FormValues>({
      defaultValues: {
        username: '',
        bikeModel: '',
        vin: '',
        phone: '+91 ',
        email: '',
        location: '',
        state: '',
        city: '',
        pincode: '',
        dealerId: '',
        upgradeTimeline: '',
        acceptedTerms: false,
      },
      mode: 'onChange',
    });

  const [otpOpen, setOtpOpen] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  // BUG-053/055: real-time inline pincode-mismatch error.
  const [pincodeMatchError, setPincodeMatchError] = useState<string | null>(null);
  const watchedPincode = useWatch({ control, name: 'pincode' });
  const watchedCity = useWatch({ control, name: 'city' });
  const watchedState = useWatch({ control, name: 'state' });
  useEffect(() => {
    if (!watchedPincode || !/^\d{6}$/.test(watchedPincode)) {
      setPincodeMatchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkPincodeMatch({
        pincode: watchedPincode,
        city: watchedCity,
        state: watchedState,
      });
      if (cancelled) return;
      setPincodeMatchError(
        result.status === 'mismatch' || result.status === 'invalid'
          ? result.error ?? null
          : null,
      );
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [watchedPincode, watchedCity, watchedState, control]);
  // QA RE-OPEN bug #2: preserve the (otpId, sentAt) from the first
  // /otp/send across the Edit-Details → Resubmit lifecycle. The OTP
  // modal unmounts when the user taps Edit Details; without this
  // session preserved here, the remount fires a fresh /otp/send within
  // the server's 30-second window and returns OTP_RESEND_TOO_SOON,
  // leaving the modal with no otpId and a disabled Verify button.
  // Cleared on successful verify, on close, and when the user edits
  // the phone number (since a different phone needs its own OTP).
  const [otpSession, setOtpSession] = useState<{ otpId: string; sentAt: number } | null>(
    null,
  );

  // QA: the modal is mounted globally in App.tsx so it can be opened from
  // any nav link. Without `enabled: open`, this query fired on every page
  // load — including the 404 page — wasting an /dealers round-trip even
  // when the buyer never opens the Sell Bike form. Gating on `open`
  // defers the fetch until the modal actually surfaces.
  const dealersQuery = useQuery({
    queryKey: ['public-dealers-options', 'sell-bike'],
    queryFn: () =>
      api<DealerOption[]>('/dealers?lat=20.5937&lng=78.9629&radius=500'),
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const selectedState = useWatch({ control, name: 'state' });
  const cityOptions = citiesForState(selectedState ?? '');

  // QA RE-OPEN bug #5 — dealer auto-pick. Watches the buyer's State,
  // City, Pincode, and Location fields and, when at least one of them
  // is set, picks the dealer whose pincode/city matches most closely.
  // Priority: exact pincode > city match > first dealer (fallback).
  // Will NOT override a dealer the user explicitly chose — we set
  // `autoPickedRef` after the first auto-write and bail if the user
  // has since changed dealerId to anything else.
  const selectedCity = useWatch({ control, name: 'city' });
  const selectedPincode = useWatch({ control, name: 'pincode' });
  const currentDealerId = useWatch({ control, name: 'dealerId' });
  const autoPickedRef = useRef<string | null>(null);
  useEffect(() => {
    const dealers = dealersQuery.data;
    if (!dealers || dealers.length === 0) return;
    // Has the user picked a dealer themselves? If currentDealerId is
    // set to something that wasn't our last auto-pick, treat the field
    // as manually owned and stop auto-writing.
    if (currentDealerId && currentDealerId !== autoPickedRef.current) {
      return;
    }
    // Need at least one geo signal before suggesting a dealer.
    if (!selectedCity && !selectedPincode && !selectedState) return;

    const cityLower = (selectedCity ?? '').trim().toLowerCase();
    const pincodeStr = (selectedPincode ?? '').trim();
    const match =
      (pincodeStr && dealers.find((d) => d.pincode === pincodeStr)) ||
      (cityLower && dealers.find((d) => d.city.toLowerCase() === cityLower)) ||
      null;
    if (match && match.id !== currentDealerId) {
      setValue('dealerId', match.id, { shouldValidate: true, shouldDirty: true });
      autoPickedRef.current = match.id;
    }
  }, [
    dealersQuery.data,
    selectedCity,
    selectedPincode,
    selectedState,
    currentDealerId,
    setValue,
  ]);

  // QA: pre-flight VIN duplicate check BEFORE the OTP modal opens, so a
  // seller whose previous enquiry on this VIN is still in progress is
  // blocked on this form — no SMS is sent for a request the server will
  // 409 anyway. Reads the freshly-typed VIN from the form, hits a public
  // GET that mirrors the same gate the create endpoint enforces, and on
  // a `blocked: true` response surfaces the friendly message inline. The
  // OTP modal only opens when the server says the VIN is clear.
  const onSubmit = async () => {
    setError(null);
    const vin = (getValues().vin || '').trim().toUpperCase();
    // Client feedback #17: VIN is now optional. When blank, skip the
    // vin-status pre-flight and go straight to OTP. When provided, the
    // full format + duplicate check runs as before.
    if (vin.length === 0 || vin.length < 6) {
      setOtpOpen(true);
      return;
    }
    setSubmitting(true);
    try {
      const status = await api<{ blocked: boolean; reason?: string; message?: string }>(
        `/leads/trade-in/vin-status?vin=${encodeURIComponent(vin)}`,
      );
      if (status.blocked) {
        setError(status.message ?? 'This bike already has an enquiry in progress.');
        return;
      }
      setOtpOpen(true);
    } catch (e) {
      // Network/lookup hiccup — fall through to OTP rather than locking
      // the seller out completely; the server-side gate still enforces.
      setOtpOpen(true);
      void e;
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerified = async (data: { phone: string }) => {
    setOtpOpen(false);
    // OTP just consumed server-side — the session is no longer valid
    // for re-use, drop it so any future submit starts a fresh /otp/send.
    setOtpSession(null);
    setSubmitting(true);
    setError(null);
    try {
      const v = getValues();
      const payload = {
        username: v.username,
        bikeModel: v.bikeModel,
        // Client feedback #17: VIN is optional — omit when blank so the
        // API's optional vin field isn't given an empty string.
        ...(v.vin.trim() ? { vin: v.vin.trim().toUpperCase() } : {}),
        phone: toApiPhone(data.phone),
        email: v.email,
        city: v.city || 'Unknown',
        dealerId: v.dealerId || undefined,
        // Client feedback #16: upgrade timeline captured in notes.
        ...(v.upgradeTimeline ? { upgradeTimeline: v.upgradeTimeline } : {}),
      };
      const res = await api<{ id: string }>('/leads/trade-in', {
        method: 'POST',
        withOtpToken: true,
        body: JSON.stringify(payload),
      });
      setSubmitted({ id: res.id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit');
    } finally {
      setSubmitting(false);
    }
  };

  // If the user edits the phone after the OTP modal opened once, the
  // preserved otpSession is for the OLD phone and must NOT be reused —
  // the server keys the active-OTP cache by phone, not by browser
  // session. Clear it so the next Send Enquiry fires a fresh /otp/send
  // for the new number.
  const watchedPhone = useWatch({ control, name: 'phone' });
  const sessionPhoneRef = useRef<string | null>(null);
  useEffect(() => {
    if (!otpSession) {
      sessionPhoneRef.current = null;
      return;
    }
    if (sessionPhoneRef.current === null) {
      sessionPhoneRef.current = watchedPhone;
      return;
    }
    if (watchedPhone !== sessionPhoneRef.current) {
      setOtpSession(null);
      sessionPhoneRef.current = null;
    }
  }, [watchedPhone, otpSession]);

  const handleClose = () => {
    closeSellBike();
    // Reset for the next time the modal opens — start with a clean form
    // unless we're showing the success state, in which case keep it visible
    // until the user actively dismisses (then reset).
    setTimeout(() => {
      reset();
      setSubmitted(null);
      setError(null);
      setOtpOpen(false);
      // Closing the whole modal also drops the OTP session — a fresh
      // open should start a fresh send-OTP cycle.
      setOtpSession(null);
    }, 200);
  };

  if (!open) return null;

  return (
    <>
      {/* QA latest (High — overflow): the overlay centres the card and
          the CARD itself caps at 90vh + scrolls internally, so the
          CANCEL / SEND ENQUIRY footer CTAs never get pushed below the
          viewport fold on a standard desktop. Previously the whole
          overlay scrolled (overflow-y-auto on the backdrop) which left
          the long form spilling past the bottom edge with the action
          buttons out of view. items-center vertically centres the
          capped card; the inner overflow-y-auto handles long content. */}
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-3 sm:px-4 py-6">
        <div className="bg-hd-white border-t-4 border-hd-orange max-w-2xl w-full p-4 sm:p-6 md:p-7 shadow-xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-baseline justify-between">
            <h2 className="font-headline tracking-headline uppercase text-text-on-light text-xl">
              Tell Us About Your Motorcycle
            </h2>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="text-gray-500 hover:text-text-on-light text-lg"
            >
              ✕
            </button>
          </div>

          {submitted ? (
            <div className="mt-6">
              <div className="bg-hd-orange/10 border border-hd-orange/40 p-4 flex items-start gap-3">
                <span
                  aria-hidden
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-hd-orange text-hd-white font-bold shrink-0"
                >
                  ✓
                </span>
                <div>
                  <p className="font-subhead uppercase tracking-subhead text-sm text-text-on-light">
                    Enquiry Sent
                  </p>
                  <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                    An authorised H-D dealer will reach out within 48 hours.
                  </p>
                </div>
              </div>
              <div className="mt-4 border-t border-gray-200 pt-3">
                <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
                  Reference ID
                </p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <code className="font-mono text-sm break-all">
                    {formatLeadId('trade-in', submitted.id)}
                  </code>
                  <CopyRefButton value={formatLeadId('trade-in', submitted.id)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border border-gray-300 px-6 py-2.5 font-subhead uppercase tracking-subhead text-xs text-gray-700 hover:border-hd-black hover:text-hd-black transition"
                >
                  Close
                </button>
                <Link
                  to={`/track?id=${formatLeadId('trade-in', submitted.id)}`}
                  onClick={handleClose}
                  className="bg-hd-orange text-hd-white font-subhead uppercase tracking-subhead text-xs px-5 py-2.5 hover:brightness-110 transition"
                >
                  Track Enquiry →
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmit)}
              // QA NEW: Figma renders every input + select with a heavy
              // 2px black border. Applied via descendant variants so we
              // don't have to override every Input className individually.
              className="mt-5 space-y-4 [&_input]:!border-2 [&_input]:!border-hd-black [&_select]:!border-2 [&_select]:!border-hd-black"
            >
              <Labelled label="Your Name" required error={errors.username?.message}>
                <Input
                  placeholder="Mohd Tai"
                  maxLength={100}
                  aria-invalid={Boolean(errors.username)}
                  {...(() => {
                    const r = register('username', nameRules);
                    // BUG-032: real-time strip non-letter chars.
                    return {
                      ...r,
                      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                        e.target.value = sanitizeAlpha(e.target.value);
                        void r.onChange(e);
                      },
                    };
                  })()}
                />
              </Labelled>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Motorcycle Model" required error={errors.bikeModel?.message}>
                  <Select
                    aria-invalid={Boolean(errors.bikeModel)}
                    {...register('bikeModel', requiredSelect('a motorcycle model'))}
                  >
                    <option value="">Choose motorcycle model</option>
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
                {/* Client feedback #17: VIN Number is no longer mandatory.
                    Validation only runs when a value is provided. */}
                <Labelled label="VIN Number" error={errors.vin?.message}>
                  <Input
                    maxLength={17}
                    placeholder="Optional — enter if available"
                    className="font-mono uppercase"
                    aria-invalid={Boolean(errors.vin)}
                    {...register('vin', {
                      validate: {
                        format: (v: string) =>
                          !v.trim() ||
                          /^[A-HJ-NPR-Z0-9]{17}$/.test(v.trim()) ||
                          'VIN must be 17 characters: A-Z (no I, O, Q) or 0-9',
                      },
                      onChange: (e) =>
                        setValue('vin', String(e.target.value).toUpperCase(), {
                          shouldValidate: true,
                        }),
                    })}
                  />
                </Labelled>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="Phone Number" required error={errors.phone?.message}>
                  <Input
                    inputMode="tel"
                    maxLength={14}
                    placeholder="Enter phone number"
                    aria-invalid={Boolean(errors.phone)}
                    {...register('phone', {
                      ...phoneRules,
                      onChange: (e) =>
                        setValue('phone', normalisePhone(e.target.value), {
                          shouldValidate: true,
                        }),
                    })}
                  />
                </Labelled>
                <Labelled label="Location" error={(errors as Record<string, { message?: string } | undefined>).location?.message}>
                  <div className="relative">
                    <Input
                      placeholder={geoBusy ? 'Locating…' : 'Choose location'}
                      readOnly={geoBusy}
                      aria-invalid={Boolean((errors as Record<string, unknown>).location)}
                      {...register('location')}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      disabled={geoBusy}
                      onClick={() => {
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
                              setValue('location', r.locality || `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`, { shouldValidate: true });
                              if (r.state) {
                                setValue('state', r.state, { shouldValidate: true });
                                // r.city is matched against our canonical list (may be null for
                                // smaller cities). Fall back to r.locality which is the raw
                                // free-text city/neighborhood name from BigDataCloud.
                                setValue('city', r.city ?? r.locality ?? '', { shouldValidate: true });
                              }
                              if (r.pincode) setValue('pincode', r.pincode, { shouldValidate: true });
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
                            if (err.code !== 1) setGeoError('Could not get your location');
                          },
                          { timeout: 8000, maximumAge: 60_000 },
                        );
                      }}
                      aria-label="Use my current location"
                      className={`absolute right-2 top-1/2 -translate-y-1/2 text-hd-orange hover:brightness-110 ${geoBusy ? 'animate-pulse' : ''}`}
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
                  {geoError && (
                    <p className="text-[10px] text-warning mt-1">{geoError}</p>
                  )}
                </Labelled>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled label="State" required error={errors.state?.message}>
                  <Select
                    aria-invalid={Boolean(errors.state)}
                    {...register('state', {
                      ...requiredSelect('a state'),
                      onChange: () => {
                        setValue('city', '', { shouldValidate: true });
                      },
                    })}
                  >
                    <option value="">Select state</option>
                    {INDIA_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Labelled>
                <Labelled label="City" required error={errors.city?.message}>
                  <Select
                    aria-invalid={Boolean(errors.city)}
                    disabled={!selectedState}
                    {...register('city', requiredSelect('a city'))}
                  >
                    <option value="">
                      {selectedState ? 'Select city' : 'Pick a state first'}
                    </option>
                    {cityOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </Select>
                </Labelled>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Labelled
                  label="Pin Code"
                  error={errors.pincode?.message ?? (pincodeMatchError ?? undefined)}
                >
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="110053"
                    aria-invalid={Boolean(errors.pincode || pincodeMatchError)}
                    {...(() => {
                      const r = register('pincode', optionalPincodeRules);
                      return {
                        ...r,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.target.value = sanitizeDigits(e.target.value, 6);
                          void r.onChange(e);
                        },
                      };
                    })()}
                  />
                </Labelled>
                <Labelled label="Choose Dealer" required error={errors.dealerId?.message}>
                  <Select
                    aria-invalid={Boolean(errors.dealerId)}
                    {...register('dealerId', requiredSelect('a dealer'))}
                    disabled={dealersQuery.isLoading}
                  >
                    <option value="">
                      {dealersQuery.isLoading ? 'Loading dealers…' : 'Select a dealer'}
                    </option>
                    {dealersQuery.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · {d.city}
                      </option>
                    ))}
                  </Select>
                </Labelled>
              </div>

              {/* QA RE-OPEN: Email is REQUIRED by the trade-in lead API
                  (tradeInLeadInput uses z.string().email()). Removing
                  this field previously caused the post-OTP submit to
                  fail with "Invalid request payload" + "email: Invalid
                  email" because the form was sending email: ''. Field
                  restored so the dealer can also reach the seller by
                  email. */}
              <Labelled label="Email" required error={errors.email?.message}>
                <Input
                  type="email"
                  placeholder="you@example.com"
                  maxLength={254}
                  aria-invalid={Boolean(errors.email)}
                  {...register('email', emailRules)}
                />
              </Labelled>

              {/* "Are you looking for an upgrade?" — simple Yes / No */}
              <div>
                <p className="font-subhead font-bold tracking-subhead text-[11px] text-text-on-light mb-2">
                  Are you looking for an upgrade?
                </p>
                <div className="flex gap-6">
                  {[
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="radio"
                        value={opt.value}
                        className="accent-hd-orange"
                        {...register('upgradeTimeline')}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {error && <div className="text-danger text-sm">{error}</div>}

              <label className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-hd-orange shrink-0"
                  aria-invalid={Boolean(errors.acceptedTerms)}
                  {...register('acceptedTerms', termsCheckboxRules)}
                />
                <span>
                  I have read, understood and accept the{' '}
                  {/* External links so the modal stays mounted with all
                      the user's typed data; previously these were
                      <Link to=> which client-side-routed away and
                      destroyed the in-flight enquiry form (QA bug 2). */}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hd-orange underline hover:brightness-110"
                  >
                    Terms and Conditions
                  </a>{' '}
                  and{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-hd-orange underline hover:brightness-110"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              {/* QA NEW: Cancel as bordered black outline (square corners),
                  Send Enquiry as solid orange + bold uppercase "SEND
                  ENQUIRY" per Figma. The Button component already
                  defaults to font-subhead + uppercase + tracking-subhead;
                  we add font-bold so it reads as full-weight. */}
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="border-2 border-hd-black px-8 py-2.5 font-subhead font-bold uppercase tracking-subhead text-xs text-hd-black hover:bg-hd-black hover:text-hd-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!isValid || submitting}
                  className="bg-hd-orange text-hd-white px-8 py-2.5 font-subhead font-bold uppercase tracking-subhead text-xs hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting…' : 'Send Enquiry'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* OTP-only verification — phone, name, email already collected above. */}
      {otpOpen && (
        <InfoGateModal
          open
          purpose="TRADE_IN"
          prefilled={{
            // QA: strip the cosmetic "+91 " space before handing the phone
            // to the OTP modal — the API phone schema is strict
            // "+91XXXXXXXXXX" (no whitespace) and the modal posts this
            // value straight to /otp/send.
            phone: toApiPhone(getValues('phone')),
            name: getValues('username'),
            email: getValues('email'),
            vin: getValues('vin'),
            bikeModel: getValues('bikeModel'),
            state: getValues('state'),
            city: getValues('city'),
            pincode: getValues('pincode'),
            location: getValues('location'),
            dealerId: getValues('dealerId'),
          }}
          // QA RE-OPEN bug #2: pass-through the preserved OTP session
          // so a remount within the 30-second server window reuses the
          // existing otpId instead of triggering OTP_RESEND_TOO_SOON.
          existingOtp={otpSession}
          onSent={(session) => setOtpSession(session)}
          onVerified={handleVerified}
          onClose={() => setOtpOpen(false)}
        />
      )}
    </>
  );
}

// QA latest (Medium): required fields now show a red asterisk (*)
// after the label so the mandatory inputs are visually flagged up
// front. Only the optional Pin Code field passes required={false}
// (the sole field the QA carved out). The hint slot stays dropped
// from the visible UI per the earlier Figma pass.
function Labelled({
  label,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block font-subhead font-bold tracking-subhead uppercase text-[11px] text-text-on-light mb-1.5">
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden>*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-[11px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
