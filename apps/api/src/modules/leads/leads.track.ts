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

// Public lead tracker. Lead IDs are CUIDs (collision-resistant ~25 chars), so
// guessing one is impractical for a v1 demo. Returns status + dealer + context;
// intentionally never returns PII.
export async function trackLead({ id }: TrackQuery): Promise<TrackResult> {
  if (!id || id.length < 6) {
    throw new HttpError(400, 'INVALID_ID', 'Enquiry ID is required');
  }

  const enquiry = (await prisma.enquiry.findUnique({
    where: { id },
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
    where: { id },
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
