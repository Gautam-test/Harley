// Server-side mirror of the buyer/dealer/admin formatLeadId helper so
// every outbound surface that displays a lead reference — buyer
// confirmation email, dealer notification email, admin notifications —
// uses the same human-friendly "B-2026-7QUD" / "S-2026-7QUD" format the
// buyer saw on the success modal and the dealer sees on their portal.
//
// The track-by-ref endpoint already parses this format back into the
// underlying CUID (see leads.track.ts), so a buyer who pastes the ref
// from their email lands on the right lead.
export type LeadKind = 'buyer' | 'trade-in';

const PREFIX: Record<LeadKind, string> = {
  buyer: 'B',
  'trade-in': 'S',
};

export function formatLeadId(kind: LeadKind, id: string, createdAt?: Date | string): string {
  const year = createdAt ? new Date(createdAt).getFullYear() : new Date().getFullYear();
  const suffix = id.slice(-4).toUpperCase();
  return `${PREFIX[kind]}-${year}-${suffix}`;
}
