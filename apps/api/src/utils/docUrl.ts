// Normalises asset URLs stored on legacy listings so the buyer/admin/dealer
// UIs always render a reachable href.
//
// Two historical data shapes that produced the QA "site can't be reached"
// reports for inspection PDFs and CPO-kit documents:
//
//   1. CPO-kit URLs stored from the early Torque mock used the literal
//      hostname `https://torque.mock/...`. DNS doesn't resolve that hostname,
//      so any anchor click failed at the network layer. The mock client was
//      later fixed to emit `/api/v1/torque/mock-docs/...` URLs; this helper
//      rewrites the old shape on read so seed/legacy rows keep working
//      without a DB migration.
//
//   2. Inspection PDFs stored as bare filenames (`inspectionreport.pdf`)
//      from older test fixtures. A bare filename in an `<a href>` resolves
//      relative to the current page, so `/admin/listings/123/inspectionreport
//      .pdf` 404s. Prefix any bare filename with the inspection-files
//      serving path so the browser hits the API instead.

const TORQUE_MOCK_HOST = /^https?:\/\/torque\.mock\//i;
const BARE_PDF = /^[a-zA-Z0-9._-]+\.pdf$/;

export function normalizeInspectionUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (TORQUE_MOCK_HOST.test(trimmed)) {
    // Defensive — inspection PDFs shouldn't live on torque.mock, but if a
    // legacy fixture put one there, route it through the mock-doc proxy
    // (the same one CPO-kit links use) so the file at least opens.
    return trimmed.replace(TORQUE_MOCK_HOST, '/api/v1/torque/mock-docs/');
  }
  if (BARE_PDF.test(trimmed)) {
    return `/api/v1/inspection/files/${trimmed}`;
  }
  return trimmed;
}

export function normalizeCpoDocs(
  docs: unknown,
): Record<string, string> | null | undefined {
  if (docs == null) return docs as null | undefined;
  if (typeof docs !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(docs as Record<string, unknown>)) {
    if (typeof v !== 'string' || !v.trim()) continue;
    out[k] = TORQUE_MOCK_HOST.test(v)
      ? v.replace(TORQUE_MOCK_HOST, '/api/v1/torque/mock-docs/')
      : v;
  }
  return out;
}
