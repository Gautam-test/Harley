// Human-friendly lead reference ID — same format as the dealer + admin
// portals so buyers see the exact string ops/dealers see ("B-2026-7QUD").
//
// Buyer-listing enquiry → B-{YYYY}-{XXXX}
// Seller / trade-in lead → S-{YYYY}-{XXXX}
//
// The suffix is the last four chars of the underlying CUID (uppercased).
// The API's /leads/track endpoint also accepts this formatted ref, so the
// buyer can paste it straight into Track Enquiry.
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
