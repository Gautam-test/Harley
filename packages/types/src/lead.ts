import { z } from 'zod';
import { phoneIN, pincodeIN } from './common.js';
import { vin } from './listing.js';

export const leadStatus = z.enum([
  'NEW',
  'CONTACTED',
  'ON_SITE_VISIT',
  'LOAN_APPROVAL',
  'IN_PROGRESS',
  'CONVERTED',
  'SUCCESS',
  'LOST',
  'DEAD',
  'CLOSED',
]);
export type LeadStatus = z.infer<typeof leadStatus>;

// Dealer-facing 6-stage forward pipeline for buyer leads. DEAD lived in this
// array previously (rendered as the "stage after SUCCESS") which surprised
// dealers — DEAD is an alt-terminal escape, not a happy-path step. Both
// DEAD and LOST are now universal alt-terminals (see canTransitionLead and
// the LeadDetailPage terminal banner) and never appear in the numbered bar.
export const BUYER_LEAD_PIPELINE = [
  'NEW',
  'CONTACTED',
  'ON_SITE_VISIT',
  'LOAN_APPROVAL',
  'CLOSED',
  'SUCCESS',
] as const satisfies readonly LeadStatus[];

// Seller / trade-in 4-stage forward pipeline (per Figma Dealer/Halrey
// dealer_page-0004.jpg). DEAD removed for the same reason as BUYER above.
export const SELLER_LEAD_PIPELINE = [
  'NEW',
  'CONTACTED',
  'IN_PROGRESS',
  'CLOSED',
] as const satisfies readonly LeadStatus[];

// Friendly labels for both pipelines so the dealer's progress bar, the
// dropdown, and the buyer-facing track page all show the same words.
// Keep these in sync with apps/web-buyer/src/pages/TrackPage.tsx → BUYER_STAGES
// / SELLER_STAGES (those carry buyer-tone copy with extra "note" lines, but
// the headline label here is the canonical one).
//
// DEAD and LOST both surface as "Not Interested" — the dealer-facing UX
// folded the two alt-terminals into a single option (operations didn't
// distinguish between "buyer ghosted" and "lead is dead", they both meant
// the same thing in practice). Both enum values remain so legacy rows and
// API consumers that wrote LOST keep working, but the UI only offers DEAD
// going forward and renders either as "Not Interested".
export const LEAD_STAGE_LABELS: Record<LeadStatus, string> = {
  NEW: 'Enquiry Received',
  CONTACTED: 'Dealer Contacted',
  ON_SITE_VISIT: 'On-Site Visit',
  LOAN_APPROVAL: 'Loan Approval',
  IN_PROGRESS: 'In Progress',
  CONVERTED: 'Converted',
  CLOSED: 'Booking Closed',
  SUCCESS: 'Delivered',
  LOST: 'Not Interested',
  DEAD: 'Not Interested',
};

/** Single alt-terminal status the UI now offers. Legacy LOST rows are still
 *  accepted by the API and rendered as "Not Interested" too. */
export const ALT_TERMINAL_STATUS = 'DEAD' as const satisfies LeadStatus;

// The legacy `general` (info-gate popup) lead kind was removed in May 2026;
// the buyer journey now goes straight to listing-level enquiries, so only
// buyer + trade-in remain.
export type LeadKind = 'buyer' | 'trade-in';
export const PIPELINE_BY_KIND: Record<LeadKind, readonly LeadStatus[]> = {
  buyer: BUYER_LEAD_PIPELINE,
  'trade-in': SELLER_LEAD_PIPELINE,
};

/**
 * Returns true when the dealer is allowed to move from `from` → `to`.
 *
 * Pipeline freely walks in any direction — early builds enforced
 * forward-only progression, but operations pushed back: real-world flows
 * include "buyer ghosted, then came back" (LOST → CONTACTED), "marked
 * Closed but actually still negotiating" (CLOSED → ON_SITE_VISIT), and
 * "test-ride scheduled before we logged the call" (NEW ↔ ON_SITE_VISIT).
 * The only invariant is the status must be a value defined in the
 * leadStatus enum; cross-kind statuses (e.g. IN_PROGRESS on a buyer lead)
 * are still rejected because they don't render anywhere on that pipeline.
 */
export function canTransitionLead(
  kind: LeadKind,
  from: LeadStatus,
  to: LeadStatus,
): boolean {
  if (from === to) return true;
  const pipe = PIPELINE_BY_KIND[kind];
  // DEAD / LOST are universal alt-terminals — every lead can be marked as
  // either, and reset back from either, at any time.
  if (to === 'DEAD' || to === 'LOST') return true;
  if (from === 'DEAD' || from === 'LOST') return true;
  // Both endpoints must be on the lead's own pipeline. Off-pipeline target
  // (e.g. CONVERTED, or a trade-in stage on a buyer lead) is rejected.
  return pipe.includes(to);
}

export const enquiryInput = z.object({
  name: z.string().min(2).max(100),
  phone: phoneIN,
  email: z.string().email(),
  city: z.string().optional(),
  pincode: pincodeIN.optional(),
  message: z.string().max(1000).optional(),
});
export type EnquiryInput = z.infer<typeof enquiryInput>;

// Lead-channel taxonomy — where the dealer rep got this lead from. Drives
// the per-rep / per-channel attribution report later, so keep this list
// stable: each value is an enum row in the future BI table.
export const leadChannel = z.enum([
  'walk-in',
  'phone',
  'website',
  'referral',
  'event',
  'other',
]);
export type LeadChannel = z.infer<typeof leadChannel>;

export const visitPreference = z.enum(['test-ride', 'showroom', 'virtual', 'none-yet']);
export const callWindow = z.enum(['morning', 'afternoon', 'evening', 'anytime']);

// Dealer logging a buyer enquiry by hand — same shape as the public form,
// plus the listing the buyer asked about (required, since the dealer always
// knows which bike they're talking about) AND the qualifying questions a
// rep usually asks on a phone call / walk-in.
//
// All extras except `source` are optional — the dealer should be able to
// log a partial lead in 30 seconds and fill in the rest later from the
// detail drawer. Extras are folded into `notes` JSON server-side so the
// schema stays migration-free.
export const dealerBuyerEnquiryInput = enquiryInput.extend({
  listingId: z.string().min(1),
  source: leadChannel,
  state: z.string().min(1).max(60).optional(),
  /** Indicative budget in INR — buyer's stated cap, not a financing limit. */
  budget: z.number().int().positive().max(100_000_000).optional(),
  visitPreference: visitPreference.optional(),
  bestTimeToCall: callWindow.optional(),
  financingNeeded: z.boolean().optional(),
  tradeInInterest: z.boolean().optional(),
});
export type DealerBuyerEnquiryInput = z.infer<typeof dealerBuyerEnquiryInput>;

export const tradeInLeadInput = z.object({
  username: z.string().min(2).max(100),
  bikeModel: z.string().min(1).max(100),
  vin: vin,
  phone: phoneIN,
  email: z.string().email(), // PRD §6.1.6 — recommend adding (Open Question 6)
  city: z.string().min(1).max(100), // PRD §6.1.6 — recommend adding
  // Optional — when supplied (e.g. from "Choose Dealer" select on /sell-bike),
  // routes the lead to that dealer instead of the nearest active one.
  dealerId: z.string().min(1).optional(),
});
export type TradeInLeadInput = z.infer<typeof tradeInLeadInput>;

// Dealer logging a seller / trade-in lead by hand. Captures the qualifying
// questions a buyback rep needs before booking an inspection slot. As with
// the buyer-side dealer input, only the source is required — every other
// field can be filled in later from the detail drawer. Extras are folded
// into `notes` JSON server-side.
export const dealerTradeInLeadInput = tradeInLeadInput.extend({
  source: leadChannel,
  state: z.string().min(1).max(60).optional(),
  pincode: pincodeIN.optional(),
  year: z.number().int().min(1903).max(2100).optional(),
  kmsDriven: z.number().int().min(0).max(1_000_000).optional(),
  /** Number of previous owners — 1 / 2 / 3 / 4+. */
  owners: z.number().int().min(1).max(20).optional(),
  colour: z.string().max(50).optional(),
  /** Seller's expected payout in INR. */
  askingPrice: z.number().int().positive().max(100_000_000).optional(),
  reasonForSelling: z.string().max(500).optional(),
  rcAvailable: z.boolean().optional(),
  serviceHistoryAvailable: z.boolean().optional(),
  bestTimeToCall: callWindow.optional(),
  /** ISO YYYY-MM-DD; the seller's insurance expiry. */
  insuranceValidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** True if there's an unpaid loan against the bike — affects re-titling. */
  loanOutstanding: z.boolean().optional(),
  /** Free-text list of accessories / modifications (HOG, exhaust, panniers…). */
  modifications: z.string().max(500).optional(),
  /** Free-form conversation notes from the rep — visible to the buyback team. */
  message: z.string().max(2000).optional(),
});
export type DealerTradeInLeadInput = z.infer<typeof dealerTradeInLeadInput>;
