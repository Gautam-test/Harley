import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';

interface TrackResult {
  type: 'BUYER' | 'TRADE_IN';
  status: 'NEW' | 'CONTACTED' | 'IN_PROGRESS' | 'CONVERTED' | 'LOST' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
  context: string;
  dealerName: string | null;
}

interface TrackQuery {
  id: string;
  emailLast4?: string;
}

interface BuyerEnquiryRow {
  id: string;
  status: TrackResult['status'];
  createdAt: Date;
  updatedAt: Date;
  listing: { year: number; modelName: string } | null;
  dealer: { name: string } | null;
}
interface TradeInLeadRow {
  id: string;
  status: TrackResult['status'];
  createdAt: Date;
  updatedAt: Date;
  bikeModel: string;
  dealer: { name: string } | null;
}

// Public lead tracker. Accepts either:
//   - the raw CUID (`cmpxw7p4s0028491qqy9c6b8z`), or
//   - the human-friendly formatted ref shown on the success modal and the
//     dealer portal (`B-2026-7QUD` for buyer, `S-2026-7QUD` for trade-in).
// Lead IDs are CUIDs (collision-resistant ~25 chars), so guessing one is
// impractical for a v1 demo. Returns status + dealer + context; never PII.
const FORMATTED_REF = /^([BS])-(\d{4})-([A-Z0-9]{4})$/;

async function resolveByFormattedRef(
  prefix: 'B' | 'S',
  year: number,
  suffix: string,
): Promise<{ kind: 'BUYER' | 'TRADE_IN'; id: string } | null> {
  // CUIDs are lowercase; the displayed suffix is uppercased. The trailing
  // 4 chars of the CUID are enough to disambiguate within (kind, year)
  // in practice (4-char base36 ≈ 1.7M slots / kind / year).
  const lowerSuffix = suffix.toLowerCase();
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  if (prefix === 'B') {
    const row = await prisma.enquiry.findFirst({
      where: { id: { endsWith: lowerSuffix }, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row ? { kind: 'BUYER', id: row.id } : null;
  }
  const row = await prisma.tradeInLead.findFirst({
    where: { id: { endsWith: lowerSuffix }, createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return row ? { kind: 'TRADE_IN', id: row.id } : null;
}

export async function trackLead({ id }: TrackQuery): Promise<TrackResult> {
  if (!id || id.length < 6) {
    throw new HttpError(400, 'INVALID_ID', 'Enquiry ID is required');
  }

  // If the buyer typed/pasted the formatted ref (B-YYYY-XXXX), resolve
  // it to the underlying CUID before running the standard lookup. This
  // keeps the rest of the function untouched and lets the same row be
  // tracked by either form.
  let resolvedId = id;
  const m = id.match(FORMATTED_REF);
  if (m) {
    const [, prefix, yearStr, suffix] = m;
    const hit = await resolveByFormattedRef(
      prefix as 'B' | 'S',
      Number(yearStr),
      suffix as string,
    );
    if (!hit) throw new HttpError(404, 'ENQUIRY_NOT_FOUND', 'No enquiry found with that ID');
    resolvedId = hit.id;
  }

  const enquiry = (await prisma.enquiry.findUnique({
    where: { id: resolvedId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      listing: { select: { year: true, modelName: true } },
      dealer: { select: { name: true } },
    },
  })) as unknown as BuyerEnquiryRow | null;
  if (enquiry) {
    return {
      type: 'BUYER',
      status: enquiry.status,
      createdAt: enquiry.createdAt.toISOString(),
      updatedAt: enquiry.updatedAt.toISOString(),
      context: enquiry.listing
        ? `Listing enquiry for ${enquiry.listing.year} ${enquiry.listing.modelName}`
        : 'Listing enquiry',
      dealerName: enquiry.dealer?.name ?? null,
    };
  }

  const tradeIn = (await prisma.tradeInLead.findUnique({
    where: { id: resolvedId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      bikeModel: true,
      dealer: { select: { name: true } },
    },
  })) as unknown as TradeInLeadRow | null;
  if (tradeIn) {
    return {
      type: 'TRADE_IN',
      status: tradeIn.status,
      createdAt: tradeIn.createdAt.toISOString(),
      updatedAt: tradeIn.updatedAt.toISOString(),
      context: `Trade-in enquiry for ${tradeIn.bikeModel}`,
      dealerName: tradeIn.dealer?.name ?? null,
    };
  }

  throw new HttpError(404, 'ENQUIRY_NOT_FOUND', 'No enquiry found with that ID');
}
