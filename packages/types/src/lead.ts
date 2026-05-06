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

// Dealer-facing 6-stage pipeline that the freeze design uses for buyer leads.
export const BUYER_LEAD_PIPELINE = [
  'NEW',
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

// Dealer logging a buyer enquiry by hand — same shape as the public form,
// plus the listing the buyer asked about (required, since the dealer always
// knows which bike they're talking about).
export const dealerBuyerEnquiryInput = enquiryInput.extend({
  listingId: z.string().min(1),
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
