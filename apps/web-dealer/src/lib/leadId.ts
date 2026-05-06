// Human-friendly lead reference ID derived deterministically from the database
// CUID + createdAt. Matches the freeze design style ("B-2026-013", "S-2026-002")
// without requiring a schema migration; the suffix is the last four chars of
// the CUID so it's still unique per kind/year.
//
// Buyer-listing enquiry → B-{YYYY}-{XXXX}
// Seller / trade-in lead → S-{YYYY}-{XXXX}
export type LeadKind = 'buyer' | 'trade-in';

const PREFIX: Record<LeadKind, string> = {
  buyer: 'B',
  'trade-in': 'S',
};

export function formatLeadId(kind: LeadKind, id: string, createdAt?: string): string {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const suffix = id.slice(-4).toUpperCase();
  return `${PREFIX[kind]}-${year}-${suffix}`;
}
