import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { InfoGateModal } from './InfoGateModal';
import { formatLeadId } from '../lib/leadId';

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
  // No localStorage-driven hints, no my-status pre-check, no popup. The
  // duplicate-by-mobile rule lives entirely on the API: if the buyer
  // submits with a phone that already has an open enquiry on this
  // listing, the POST returns 409 with a friendly message which we
  // surface as inline error text under the CTAs.
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);


  const mapsEmbed = `https://www.google.com/maps?q=${encodeURIComponent(
    `${dealerName} ${dealerCity}`,
  )}&output=embed`;
  // QA: "View Dealer Details" must NOT navigate. The DealerLocator
  // section ("Find your dealer") already renders further down the same
  // ListingDetailPage — anchor-scroll to its heading instead so the
  // buyer stays on the VDP.
  const scrollToDealerLocator = () => {
    const el = document.getElementById('dealer-locator-heading');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
      // Every API error — including 409 ENQUIRY_ALREADY_OPEN — surfaces
      // as an inline message under the CTAs. We deliberately don't pop
      // a modal on 409: QA pushback was that a popup blocks the flow,
      // whereas the buyer should still be able to re-open the form and
      // fill it (e.g. retry with a different mobile). The API's 409
      // message reads "Enquiry form already filled with this number…"
      // which is exactly the validation copy the ticket asks for.
      setError(e instanceof ApiError ? e.message : 'Could not send enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="bg-hd-white border border-gray-200 overflow-hidden">
        {/* Price + EMI from */}
        <div className="p-5">
          {/* Price wordmark in font-subhead (1903 Sans) per the Figma
              parity pass — Condensed was visually compressing the rupee
              + digits and felt off-spec next to the calmer card chrome. */}
          <p className="font-subhead font-bold tracking-subhead text-3xl text-text-on-light leading-none">
            ₹ {price.toLocaleString('en-IN')}
          </p>
          {/* QA NEW: "Indicative ex-showroom — RTO, insurance & on-road
              quoted by the dealer" caption removed per Figma — the
              clutter wasn't in the design spec. The disclosure now
              lives only on the EMI calculator footer + listing detail
              spec table. */}
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

          <div className="mt-3 aspect-[16/9] border border-gray-200 overflow-hidden bg-surface-light">
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
                className="w-full bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[12px] py-3 hover:brightness-110 transition disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Enquire With Dealer'}
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
              <button
                type="button"
                onClick={scrollToDealerLocator}
                className="block text-center w-full border border-hd-black text-hd-black font-subhead uppercase tracking-subhead text-[12px] py-3 hover:bg-hd-black hover:text-hd-white transition"
              >
                View Dealer Details
              </button>
              {error && (
                <p className="text-xs text-danger mt-1">{error}</p>
              )}
            </>
          ) : (
            <div className="bg-hd-black text-hd-white overflow-hidden">
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
                <p className="font-subhead font-bold tracking-subhead uppercase text-base leading-tight">
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
                    {formatLeadId('buyer', submitted.id)}
                  </p>
                </div>

                <Link
                  to={`/track?id=${formatLeadId('buyer', submitted.id)}`}
                  className="block text-center mt-4 bg-hd-orange text-hd-black font-subhead uppercase tracking-subhead text-[11px] py-2.5 hover:brightness-110 transition"
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

      {/* "Already submitted" popup deleted — QA pushback: a popup
          blocks the flow. The duplicate-by-mobile validation is now
          surfaced as inline error text under the CTAs (see the
          {error && ...} block above), so the buyer can re-open the
          form, edit the mobile, and try again without dismissing
          a modal. */}
    </>
  );
}
