import { Router } from 'express';
import { z } from 'zod';
import { leadStatus, type LeadStatus } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { decryptPii } from '../../utils/crypto.js';

// Admin lead-oversight routes — cross-dealer view of every enquiry/lead in
// the system. Mirrors the dealer-side queue but without the dealer-id filter,
// and adds a "stuck" flag (NEW for >7 days) so admins can spot leads that
// dealers have left lingering.
//
// Phone and email are returned in the clear here so admins can step in when
// dealers neglect leads ("stuck" entries) without bouncing back to the
// dealer portal. Access is gated by the ADMIN role above.

export const adminLeadsRouter = Router();
adminLeadsRouter.use(requireAuth(['ADMIN']));

// QA decision: the "stuck" CTA was dropped from the admin Enquiries page
// — admins manage attention via the standard status filter. The
// stuckOnly query param, stuck flag on each row, and stuckCount in the
// response are no longer returned. `isStuck` helper retired below.

const listQuery = z.object({
  kind: z.enum(['buyer', 'trade-in', 'all']).default('all'),
  status: leadStatus.optional(),
  dealerId: z.string().optional(),
  /** Free-text search across buyer name, model, VIN. */
  q: z.string().max(64).optional(),
  /** F6: filter buyer enquiries by entry channel (PORTAL = online, DEALER = walk-in). */
  channel: z.enum(['PORTAL', 'DEALER']).optional(),
});

interface ListRow {
  id: string;
  kind: 'buyer' | 'trade-in';
  name: string;
  phone: string;
  email: string;
  status: LeadStatus;
  dealerId: string;
  dealerName: string;
  /** Bike model + year (buyer) or trade-in bike line. Empty if listing was deleted. */
  bikeModel: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  /** F6: PORTAL = online enquiry, DEALER = walk-in logged by dealer rep. Buyer only. */
  entrySource?: 'PORTAL' | 'DEALER';
}

interface BuyerEnquiryRow {
  id: string;
  name: string;
  phoneEnc: string;
  emailEnc: string;
  status: LeadStatus;
  entrySource: string | null;
  dealerId: string;
  dealer: { name: string };
  listing: { year: number; modelName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}
interface TradeInLeadRow {
  id: string;
  username: string;
  phoneEnc: string;
  emailEnc: string;
  status: LeadStatus;
  dealerId: string;
  dealer: { name: string };
  bikeModel: string;
  vin: string;
  createdAt: Date;
  updatedAt: Date;
}

adminLeadsRouter.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const kindsToFetch =
      q.kind === 'all' ? (['buyer', 'trade-in'] as const) : ([q.kind] as const);

    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.dealerId ? { dealerId: q.dealerId } : {}),
    };

    const rows: ListRow[] = [];

    if (kindsToFetch.includes('buyer')) {
      const data = (await prisma.enquiry.findMany({
        where: {
          ...where,
          ...(q.channel ? { entrySource: q.channel } : {}),
          ...(q.q
            ? {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' as const } },
                  { listing: { modelName: { contains: q.q, mode: 'insensitive' as const } } },
                ],
              }
            : {}),
        },
        include: {
          dealer: { select: { name: true } },
          listing: { select: { year: true, modelName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })) as unknown as BuyerEnquiryRow[];
      for (const r of data) {
        const bikeModel = r.listing
          ? `${r.listing.year} ${r.listing.modelName}`
          : 'Listing removed';
        rows.push({
          id: r.id,
          kind: 'buyer',
          name: r.name,
          phone: decryptPii(r.phoneEnc),
          email: decryptPii(r.emailEnc),
          status: r.status,
          dealerId: r.dealerId,
          dealerName: r.dealer.name,
          bikeModel,
          context: bikeModel,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          entrySource: (r.entrySource as 'PORTAL' | 'DEALER' | null) ?? 'PORTAL',
        });
      }
    }

    if (kindsToFetch.includes('trade-in')) {
      const data = (await prisma.tradeInLead.findMany({
        where: {
          ...where,
          ...(q.q
            ? {
                OR: [
                  { username: { contains: q.q, mode: 'insensitive' as const } },
                  { bikeModel: { contains: q.q, mode: 'insensitive' as const } },
                  { vin: { contains: q.q.toUpperCase() } },
                ],
              }
            : {}),
        },
        include: { dealer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })) as unknown as TradeInLeadRow[];
      for (const r of data) {
        rows.push({
          id: r.id,
          kind: 'trade-in',
          name: r.username,
          phone: decryptPii(r.phoneEnc),
          email: decryptPii(r.emailEnc),
          status: r.status,
          dealerId: r.dealerId,
          dealerName: r.dealer.name,
          bikeModel: r.bikeModel,
          context: `Trade-in · ${r.bikeModel}`,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        });
      }
    }

    // Re-sort the unioned rows by createdAt desc (each kind was already
    // sorted, but merging requires a single ordering pass).
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({
      results: rows,
      total: rows.length,
    });
  } catch (e) {
    next(e);
  }
});

// Per-lead detail (admin view — phone/email returned in clear).
const detailParams = z.object({
  kind: z.enum(['buyer', 'trade-in']),
  id: z.string().min(1),
});

adminLeadsRouter.get(
  '/:kind/:id',
  validate(detailParams, 'params'),
  async (req, res, next) => {
    try {
      const { kind, id } = req.params as unknown as z.infer<typeof detailParams>;
      if (kind === 'buyer') {
        const row = await prisma.enquiry.findUnique({
          where: { id },
          include: {
            dealer: { select: { id: true, name: true, city: true } },
            listing: {
              select: {
                id: true,
                slug: true,
                year: true,
                modelName: true,
                modelFamily: true,
                colour: true,
                kmsDriven: true,
                price: true,
                images: true,
              },
            },
          },
        });
        if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
        // QA: surface every customer-submitted field so the admin lead
        // detail page can render a complete "Customer Details" panel.
        // Extra qualifying answers (state, source, budget, financing,
        // trade-in interest, visit preference, best time to call, looking
        // for) live in the notes JSON because the Enquiry table only has
        // dedicated columns for the common fields.
        const notes = (row.notes as Record<string, unknown> | null) ?? {};
        const pick = (k: string) =>
          typeof notes[k] === 'string' || typeof notes[k] === 'number' || typeof notes[k] === 'boolean'
            ? (notes[k] as string | number | boolean)
            : null;
        res.json({
          id: row.id,
          kind: 'buyer' as const,
          name: row.name,
          phone: decryptPii(row.phoneEnc),
          email: decryptPii(row.emailEnc),
          city: row.city,
          pincode: row.pincode,
          message: row.message,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          dealer: row.dealer,
          listing: row.listing
            ? { ...row.listing, price: Number(row.listing.price) }
            : null,
          state: pick('state'),
          source: pick('source'),
          budget: pick('budget'),
          financingNeeded: pick('financingNeeded'),
          tradeInInterest: pick('tradeInInterest'),
          visitPreference: pick('visitPreference'),
          bestTimeToCall: pick('bestTimeToCall'),
          lookingFor: pick('lookingFor'),
          employmentType: (row as unknown as { employmentType?: string | null }).employmentType ?? null,
          entrySource: (row as unknown as { entrySource?: string | null }).entrySource ?? 'PORTAL',
        });
        return;
      }
      const row = await prisma.tradeInLead.findUnique({
        where: { id },
        include: { dealer: { select: { id: true, name: true, city: true } } },
      });
      if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
      // QA: peel the seller-submitted bike + commercials data out of the
      // notes JSON; mileage (km/l) round-trips via a prefix on the
      // freeform message which we strip here so the detail page shows
      // it as a dedicated field.
      const notes = (row.notes as Record<string, unknown> | null) ?? {};
      const pick = (k: string) =>
        typeof notes[k] === 'string' || typeof notes[k] === 'number' || typeof notes[k] === 'boolean'
          ? (notes[k] as string | number | boolean)
          : null;
      const message = (pick('message') as string | null) ?? null;
      const mileageMatch = typeof message === 'string'
        ? message.match(/^Mileage:\s*(\d{1,3}(?:\.\d{1,2})?)\s*km\/l(?:\s*—\s*|\s*$)/)
        : null;
      const mileage = mileageMatch ? mileageMatch[1] : null;
      const cleanMessage = mileageMatch && message
        ? message.slice(mileageMatch[0].length)
        : message;
      res.json({
        id: row.id,
        kind: 'trade-in' as const,
        name: row.username,
        phone: decryptPii(row.phoneEnc),
        email: decryptPii(row.emailEnc),
        city: row.city,
        bikeModel: row.bikeModel,
        vin: row.vin,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        dealer: row.dealer,
        state: pick('state'),
        pincode: pick('pincode'),
        source: pick('source'),
        year: pick('year'),
        kmsDriven: pick('kmsDriven'),
        owners: pick('owners'),
        colour: pick('colour'),
        askingPrice: pick('askingPrice'),
        bestTimeToCall: pick('bestTimeToCall'),
        rcAvailable: pick('rcAvailable'),
        serviceHistoryAvailable: pick('serviceHistoryAvailable'),
        insuranceValidUntil: pick('insuranceValidUntil'),
        loanOutstanding: pick('loanOutstanding'),
        modifications: pick('modifications'),
        reasonForSelling: pick('reasonForSelling'),
        mileage,
        message: cleanMessage,
      });
    } catch (e) {
      next(e);
    }
  },
);
