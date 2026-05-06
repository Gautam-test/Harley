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

// Dealer-facing 7-stage pipeline that the freeze design uses for buyer leads.
// CONTACTED was missing in the initial cut so any dealer attempt to mark a
// lead "Contacted" came back with 409 INVALID_TRANSITION even though the
// status is in the leadStatus enum and the UI offered it.
export const BUYER_LEAD_PIPELINE = [
  'NEW',
  'CONTACTED',
  'ON_SITE_VISIT',
  'LOAN_APPROVAL',
  'CLOSED',
  'SUCCESS',
  'DEAD',
] as const satisfies readonly LeadStatus[];

// Seller / trade-in 4-stage pipeline (per Figma Dealer/Halrey dealer_page-0004.jpg).
//   NEW → CONTACTED (Inspection) → IN_PROGRESS (Approved) → CLOSED, DEAD as alt-terminal.
export const SELLER_LEAD_PIPELINE = [
  'NEW',
  'CONTACTED',
  'IN_PROGRESS',
  'CLOSED',
  'DEAD',
] as const satisfies readonly LeadStatus[];

// Allowed transitions: a lead can move forward to any later stage in its
// pipeline OR jump to the alt-terminal DEAD/LOST at any time. Backwards
// movement is rejected — mistakes get a comment + a fresh lead, not edits.
//
// The legacy `general` (info-gate popup) lead kind was removed in May 2026;
// the buyer journey now goes straight to listing-level enquiries, so only
// buyer + trade-in remain.
export type LeadKind = 'buyer' | 'trade-in';
export const PIPELINE_BY_KIND: Record<LeadKind, readonly LeadStatus[]> = {
  buyer: BUYER_LEAD_PIPELINE,
  'trade-in': SELLER_LEAD_PIPELINE,
};

/** Returns true when the dealer is allowed to move from `from` → `to` for this kind. */
export function canTransitionLead(
  kind: LeadKind,
  from: LeadStatus,
  to: LeadStatus,
): boolean {
  const pipe = PIPELINE_BY_KIND[kind];
  if (from === to) return true;
  // Either status is off-pipeline (legacy data) — allow any move into the
  // canonical pipeline so dealers can clean up old rows.
  const fromIdx = pipe.indexOf(from);
  const toIdx = pipe.indexOf(to);
  if (fromIdx === -1) return true;
  if (toIdx === -1) return false;
  // Forward-only within the pipeline.
  return toIdx > fromIdx || to === 'DEAD' || to === 'LOST';
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
