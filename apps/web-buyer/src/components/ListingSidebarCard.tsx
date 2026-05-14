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
  // We pull `phone` from the OTP store solely to power the post-submit
  // popup's existing-lead lookup (myStatusQuery). Other fields used to
  // power a verified-shortcut + a prefilled modal, but both were removed
  // — the modal opens at its collect step every time so the buyer types
  // their CURRENT mobile, gets a fresh OTP, and dedup runs at submit.
  const { phone: storedPhone } = useOtpStore();

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

  // The previous "fast-path one-click submit for verified buyers"
  // (submitDirectly) was removed when the QA ticket clarified that the
  // form should always open on Visit Dealer click — even when the
  // buyer's OTP token is still cached from this session. The verified
  // path now flows through the same modal as a first-time buyer; the
  // <InfoGateModal prefilled={…}/> wiring below skips the collect step
  // and lands the buyer straight on OTP-entry, so the only added step
  // is re-entering the freshly-sent code (cheap, and matches the
  // ticket's "form should open normally" requirement).


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
                  // Ticket: "When a user fills out the Buyer Enquiry form
                  // using a mobile number by clicking the Visit Dealer
                  // button, and then clicks the Visit Dealer button again,
                  // the enquiry form should open normally."
                  //
                  // The fix has two halves:
                  //   1. No client-side pre-block via my-status — handled
                  //      by removing the existingLead-throws-popup gate
                  //      that used to short-circuit before the modal.
                  //   2. ALWAYS open the modal — even for buyers whose
                  //      OTP token is still cached from an earlier
                  //      enquiry this session. The previous shortcut
                  //      (`if (alreadyVerified) submitDirectly()`) fired
                  //      the API immediately and surfaced the 409 popup
                  //      without ever showing the form, which is the
                  //      "immediately displays the message" symptom the
                  //      ticket reproduces.
                  //
                  // For verified buyers we hand the modal the prefilled
                  // contact details (see <InfoGateModal prefilled={…} />
                  // below) so the modal jumps straight to OTP-entry with
                  // their name / phone / email pre-populated. The
                  // duplicate-by-mobile rule is enforced on submit by
                  // the API (409 ENQUIRY_ALREADY_OPEN); on that 409 the
                  // friendly "Already Submitted" popup with Track
                  // shortcut surfaces.
                  setModalOpen(true);
                }}
                disabled={submitting}
                className="w-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[12px] py-3 rounded-card hover:brightness-110 transition disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Visit Dealer'}
              </button>
              {/* QA: the previous "You've already enquired" amber banner
                  AND the "You've already verified — clicking will submit"
                  hint were both removed. Both rendered purely off
                  localStorage state (storedPhone / verifiedToken cached
                  from any earlier session in this browser), so they fired
                  for buyers who hadn't even touched the form on the
                  current page — the user pushed back: "until I haven't
                  filled the mobile no., how can you tell the enquiry is
                  submitted?". The submit-time popup (handleVerified's
                  409 handler) is the only place we now surface "already
                  submitted" copy, because that fires on a real attempt
                  with a real phone and has full context. */}
              <Link
                to={dealersHref}
                className="block text-center w-full border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-[12px] py-3 rounded-card hover:bg-hd-black hover:text-hd-white transition"
              >
                View Dealer Details
              </Link>
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
        // Intentionally NOT passing `prefilled` — that prop tells the
        // modal to skip its collect step and jump to OTP-entry with the
        // cached phone/name/email. QA pushed back: the cached values
        // could be stale (a previous session's test data, a different
        // person's phone on a shared device), and jumping straight to
        // OTP makes the modal look like it's already submitted on
        // someone's behalf. The modal now opens at its collect step
        // every time so the buyer enters their CURRENT mobile, gets
        // a fresh OTP for that exact number, and the duplicate-check
        // runs against the actually-typed phone at submit time.
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
