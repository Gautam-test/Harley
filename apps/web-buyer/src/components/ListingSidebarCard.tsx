import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { useOtpStore } from '../store/otp';
import { InfoGateModal } from './InfoGateModal';

interface ListingSidebarCardProps {
  slug: string;
  modelInterest: string;
  price: number;
  emiFrom: number;
  dealerId: string;
  dealerName: string;
  dealerCity: string;
}

// Mirrors the frozen Figma listing-detail right rail exactly:
//   Price · EMI from · Dealer card (name + address + Google Maps) · two CTAs.
// No phone-reveal, no separate "visit website" button — the freeze keeps this
// pane compact. The OTP info-gate modal handles enquiry submission; on
// success we replace the buttons with a small confirmation + track link.
export function ListingSidebarCard({
  slug,
  modelInterest,
  price,
  emiFrom,
  dealerId,
  dealerName,
  dealerCity,
}: ListingSidebarCardProps) {
  const {
    verifiedToken,
    verifiedFor,
    phone: storedPhone,
    name: storedName,
    email: storedEmail,
  } = useOtpStore();
  // Shortcut only works when we have the FULL profile from the previous
  // enquiry — otherwise we'd post placeholders and the dealer would get
  // a "Returning buyer / unknown@buyer.local" lead. Falling back to the
  // modal in that case is a one-time cost; the second listing in the
  // same session has all three fields cached.
  const alreadyVerified =
    Boolean(verifiedToken) &&
    verifiedFor === 'ENQUIRY' &&
    Boolean(storedPhone) &&
    Boolean(storedName) &&
    Boolean(storedEmail);

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alreadyPopupOpen, setAlreadyPopupOpen] = useState(false);

  // Server-side "has this verified buyer already enquired about this exact
  // listing AND is the lead still active?" — drives the "Buyer enquiry form
  // already submitted" popup on Visit Dealer click. Only fires when we
  // have a verified phone in the OTP store; the unverified path falls
  // straight through to the InfoGateModal so a first-time buyer never
  // sees a phantom warning.
  const myStatusQuery = useQuery({
    enabled: Boolean(storedPhone),
    queryKey: ['my-listing-status', slug, storedPhone],
    queryFn: () =>
      api<{ enquired: boolean; leadId?: string; status?: string }>(
        `/leads/listings/${slug}/my-status?phone=${encodeURIComponent(storedPhone!)}`,
      ),
    staleTime: 30 * 1000,
  });
  const existingLead = myStatusQuery.data?.enquired
    ? { id: myStatusQuery.data.leadId!, status: myStatusQuery.data.status! }
    : null;

  // When the buyer has a fresh verifiedToken and remembered identity from a
  // previous enquiry this session, the second click goes straight through
  // without re-prompting. A 401 from the API means the token expired
  // server-side; fall back to the modal to re-verify.
  const submitDirectly = async () => {
    if (!storedPhone || !storedName || !storedEmail) {
      // Profile incomplete — open the modal so we re-collect the missing
      // bits before posting. Shouldn't happen given alreadyVerified gate
      // above, but defends against an older persisted store shape.
      setModalOpen(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ id: string }>(`/leads/listings/${slug}/enquiry`, {
        method: 'POST',
        withOtpToken: true,
        body: JSON.stringify({
          name: storedName,
          phone: storedPhone,
          email: storedEmail,
          message: `I'm interested in this ${modelInterest}. Please contact me.`,
        }),
      });
      setSubmitted({ id: res.id });
    } catch (e) {
      // Token expired or otherwise invalid — fall back to the modal to
      // collect a fresh OTP. The modal also handles other API errors.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setModalOpen(true);
      } else if (e instanceof ApiError && e.code === 'ENQUIRY_ALREADY_OPEN') {
        // Server-side duplicate-by-mobile gate fired. Refetch my-status
        // to populate existingLead with the reference, then surface the
        // friendly popup with Track-Enquiry shortcut.
        await myStatusQuery.refetch();
        setAlreadyPopupOpen(true);
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not send enquiry');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(
    `${dealerName} ${dealerCity}`,
  )}&output=embed`;
  const dealersHref = `/dealers#${dealerId}`;

  const handleVerified = async (data: {
    phone: string;
    name: string;
    email: string;
    city?: string;
    pincode?: string;
    description?: string;
    lookingFor?: string;
    vin?: string;
    state?: string;
  }) => {
    setModalOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const messageLines = [
        data.description || `I'm interested in this ${modelInterest}. Please contact me.`,
      ];
      if (data.lookingFor) messageLines.push(`Looking for: ${data.lookingFor}`);
      if (data.vin) messageLines.push(`Trade-in VIN: ${data.vin}`);
      if (data.state) messageLines.push(`State: ${data.state}`);

      const res = await api<{ id: string }>(`/leads/listings/${slug}/enquiry`, {
        method: 'POST',
        withOtpToken: true,
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          email: data.email,
          city: data.city,
          pincode: data.pincode,
          message: messageLines.join('\n'),
        }),
      });
      setSubmitted({ id: res.id });
    } catch (e) {
      // Surface the duplicate-by-mobile gate via the friendly popup with
      // a Track-Enquiry shortcut; everything else falls through to the
      // generic error message.
      if (e instanceof ApiError && e.code === 'ENQUIRY_ALREADY_OPEN') {
        await myStatusQuery.refetch();
        setAlreadyPopupOpen(true);
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not send enquiry');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-hd-white border border-gray-200 rounded-card overflow-hidden">
        {/* Price + EMI from */}
        <div className="p-5">
          <p className="font-headline tracking-headline text-3xl text-text-on-light leading-none">
            ₹ {price.toLocaleString('en-IN')}
          </p>
          {/* Indicative-pricing disclosure — mandatory once we go live in
              India because the marketplace doesn't transact (RTO, on-road,
              GST and any insurance bundle quote come from the dealer
              direct). Buyer-protection regulators flag fixed-price displays
              without this caption as misleading. */}
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            Indicative ex-showroom · RTO, insurance &amp; on-road quoted by the dealer
          </p>
          <p className="text-xs text-gray-500 mt-2">
            EMI From{' '}
            <span className="text-hd-orange font-subhead">
              ₹ {emiFrom.toLocaleString('en-IN')}/Mo
            </span>{' '}
            · 48 Months
          </p>
        </div>

        {/* Dealer block */}
        <div className="border-t border-gray-200 px-5 py-4">
          <p className="font-subhead uppercase tracking-subhead text-[10px] text-hd-orange">
            {dealerName.toUpperCase()}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Authorised H-D dealer · {dealerCity}
          </p>

          <div className="mt-3 aspect-[16/9] border border-gray-200 rounded-card overflow-hidden bg-surface-light">
            <iframe
              title={`Map for ${dealerName}`}
              src={mapsEmbed}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full border-0"
              allowFullScreen
            />
          </div>
        </div>

        {/* CTAs */}
        <div className="px-5 pb-5 pt-1 space-y-2">
          {!submitted ? (
            <>
              {/* Primary CTA — label per Figma /Dealer-updated/zoom-listing-top.png
                  ("VISIT DEALER" full-width orange button). Triggers the
                  buyer-enquiry InfoGateModal. */}
              <button
                type="button"
                onClick={() => {
                  // QA: the form should always open on click. The previous
                  // pre-block (immediate "already submitted" popup before
                  // the modal even opened) confused buyers who'd just
                  // refreshed the page or were checking the form layout.
                  // The duplicate-by-mobile rule is now enforced at the
                  // API on actual submit — if a non-terminal enquiry
                  // exists for this phone, the POST returns 409
                  // ENQUIRY_ALREADY_OPEN and the modal surfaces the
                  // message at that point. Until the dealer marks the
                  // previous lead Not Interested, submit fails; until
                  // then the buyer can still review the form contents
                  // and the existingLead reference (rendered as a small
                  // banner above when present).
                  if (alreadyVerified) submitDirectly();
                  else setModalOpen(true);
                }}
                disabled={submitting}
                className="w-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[12px] py-3 rounded-card hover:brightness-110 transition disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Visit Dealer'}
              </button>
              {/* Small heads-up banner when an existing open enquiry exists
                  for the verified phone — gives the buyer a Track shortcut
                  without forcing them through the popup. The submit flow
                  itself enforces the rule via the 409. */}
              {existingLead && (
                <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 text-[11px] rounded-card">
                  You&rsquo;ve already enquired about this bike. Reference:{' '}
                  <Link
                    to={`/track?id=${existingLead.id}`}
                    className="font-mono underline hover:no-underline"
                  >
                    {existingLead.id}
                  </Link>
                </div>
              )}
              <Link
                to={dealersHref}
                className="block text-center w-full border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-[12px] py-3 rounded-card hover:bg-hd-black hover:text-hd-white transition"
              >
                View Dealer Details
              </Link>
              {alreadyVerified && !submitting && (
                <p className="text-[10px] text-gray-500 text-center">
                  You&rsquo;ve already verified — clicking above will submit your enquiry.
                </p>
              )}
              {error && (
                <p className="text-xs text-danger mt-1">{error}</p>
              )}
            </>
          ) : (
            <div className="bg-hd-black text-hd-white rounded-card overflow-hidden">
              <div className="bg-hd-orange px-4 py-2.5 flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-hd-white text-hd-orange font-bold text-xs"
                >
                  ✓
                </span>
                <span className="font-subhead uppercase tracking-subhead text-[11px] text-hd-white">
                  Enquiry Sent
                </span>
              </div>
              <div className="px-4 py-4">
                <p className="font-headline tracking-headline uppercase text-base leading-tight">
                  Thank you. <span className="text-hd-orange">Ride With Confidence.</span>
                </p>
                <p className="text-sm text-text-secondary mt-2 leading-relaxed">
                  {dealerName} will reach out within 48 hours.
                </p>

                <div className="mt-4 border-t border-surface-2 pt-3">
                  <p className="font-subhead uppercase tracking-subhead text-[10px] text-text-secondary">
                    Reference ID
                  </p>
                  <p className="font-mono text-xs text-hd-white break-all mt-1">
                    {submitted.id}
                  </p>
                </div>

                <Link
                  to={`/track?id=${submitted.id}`}
                  className="block text-center mt-4 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] py-2.5 rounded-card hover:brightness-110 transition"
                >
                  Track Your Enquiry →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <InfoGateModal
        open={modalOpen}
        purpose="ENQUIRY"
        context={{ modelInterest, preselectDealerId: dealerId }}
        onVerified={handleVerified}
        onClose={() => setModalOpen(false)}
      />

      {/* "Already submitted" popup — surfaces when a returning verified
          buyer clicks Visit Dealer on a listing they've already enquired
          about (and the dealer hasn't marked the lead Not Interested).
          Shows the reference ID + a Track Enquiry shortcut so the buyer
          can follow up instead of bouncing into a dead-end OK button. */}
      {alreadyPopupOpen && existingLead && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="already-enquired-title"
          className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center px-4 py-8 overflow-y-auto"
          onClick={() => setAlreadyPopupOpen(false)}
        >
          <div
            className="bg-hd-white border-t-4 border-hd-orange max-w-md w-full p-5 sm:p-6 rounded-card shadow-xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <h2
                id="already-enquired-title"
                className="font-subhead uppercase tracking-subhead text-text-on-light text-base"
              >
                Enquiry Already Submitted
              </h2>
              <button
                type="button"
                onClick={() => setAlreadyPopupOpen(false)}
                aria-label="Close"
                className="text-gray-500 hover:text-text-on-light text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-gray-700 mt-3 leading-relaxed">
              Buyer enquiry form already submitted. {dealerName} will reach
              out within 48 hours.
            </p>
            <div className="mt-4 border-t border-gray-200 pt-3">
              <p className="font-subhead uppercase tracking-subhead text-[10px] text-gray-500">
                Reference ID
              </p>
              <code className="block font-mono text-xs break-all mt-1">
                {existingLead.id}
              </code>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() => setAlreadyPopupOpen(false)}
                className="border border-gray-300 px-5 py-2 font-subhead uppercase tracking-subhead text-[11px] text-gray-700 hover:border-hd-black hover:text-hd-black transition rounded-card"
              >
                OK
              </button>
              <Link
                to={`/track?id=${existingLead.id}`}
                onClick={() => setAlreadyPopupOpen(false)}
                className="bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] px-5 py-2 rounded-card hover:brightness-110 transition"
              >
                Track Enquiry →
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
