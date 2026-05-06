import { Router } from 'express';
import { z } from 'zod';
import { leadStatus, type LeadStatus } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { decryptPii, maskEmail, maskPhone } from '../../utils/crypto.js';

// Admin lead-oversight routes — cross-dealer view of every enquiry/lead in
// the system. Mirrors the dealer-side queue but without the dealer-id filter,
// and adds a "stuck" flag (NEW for >7 days) so admins can spot leads that
// dealers have left lingering.
//
// PII is *masked* on list and detail views — admins are governance, not
// the assigned operator. Decrypting full phone/email here would hand any
// admin a one-click contact list of every buyer.

export const adminLeadsRouter = Router();
adminLeadsRouter.use(requireAuth(['ADMIN']));

const STUCK_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const listQuery = z.object({
  kind: z.enum(['general', 'buyer', 'trade-in', 'all']).default('all'),
  status: leadStatus.optional(),
  dealerId: z.string().optional(),
  /** Filter to leads stuck in NEW for > 7 days. Useful for the "needs attention" queue. */
  stuckOnly: z.coerce.boolean().optional(),
  /** Free-text search across buyer name, model, VIN. */
  q: z.string().max(64).optional(),
});

interface ListRow {
  id: string;
  kind: 'general' | 'buyer' | 'trade-in';
  name: string;
  phoneMasked: string;
  emailMasked: string;
  status: LeadStatus;
  dealerId: string;
  dealerName: string;
  context: string;
  /** Surfaced when the lead has sat in NEW longer than the stuck threshold. */
  stuck: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BuyerEnquiryRow {
  id: string;
  name: string;
  phoneEnc: string;
  emailEnc: string;
  status: LeadStatus;
  dealerId: string;
  dealer: { name: string };
  listing: { year: number; modelName: string } | null;
  createdAt: Date;
  updatedAt: Date;
}
interface GeneralLeadRow {
  id: string;
  name: string;
  phoneEnc: string;
  emailEnc: string;
  status: LeadStatus;
  dealerId: string;
  dealer: { name: string };
  modelInterest: string | null;
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

function isStuck(status: LeadStatus, createdAt: Date): boolean {
  return status === 'NEW' && Date.now() - createdAt.getTime() > STUCK_THRESHOLD_MS;
}

adminLeadsRouter.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const kindsToFetch =
      q.kind === 'all' ? (['buyer', 'general', 'trade-in'] as const) : ([q.kind] as const);

    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.dealerId ? { dealerId: q.dealerId } : {}),
    };

    const rows: ListRow[] = [];

    if (kindsToFetch.includes('buyer')) {
      const data = (await prisma.enquiry.findMany({
        where: {
          ...where,
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
        rows.push({
          id: r.id,
          kind: 'buyer',
          name: r.name,
          phoneMasked: maskPhone(decryptPii(r.phoneEnc)),
          emailMasked: maskEmail(decryptPii(r.emailEnc)),
          status: r.status,
          dealerId: r.dealerId,
          dealerName: r.dealer.name,
          context: r.listing
            ? `${r.listing.year} ${r.listing.modelName}`
            : 'Listing enquiry',
          stuck: isStuck(r.status, r.createdAt),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        });
      }
    }

    if (kindsToFetch.includes('general')) {
      const data = (await prisma.generalLead.findMany({
        where: {
          ...where,
          ...(q.q
            ? {
                OR: [
                  { name: { contains: q.q, mode: 'insensitive' as const } },
                  { modelInterest: { contains: q.q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
        include: { dealer: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })) as unknown as GeneralLeadRow[];
      for (const r of data) {
        rows.push({
          id: r.id,
          kind: 'general',
          name: r.name,
          phoneMasked: maskPhone(decryptPii(r.phoneEnc)),
          emailMasked: maskEmail(decryptPii(r.emailEnc)),
          status: r.status,
          dealerId: r.dealerId,
          dealerName: r.dealer.name,
          context: r.modelInterest ?? 'General enquiry',
          stuck: isStuck(r.status, r.createdAt),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
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
          phoneMasked: maskPhone(decryptPii(r.phoneEnc)),
          emailMasked: maskEmail(decryptPii(r.emailEnc)),
          status: r.status,
          dealerId: r.dealerId,
          dealerName: r.dealer.name,
          context: `Trade-in · ${r.bikeModel}`,
          stuck: isStuck(r.status, r.createdAt),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        });
      }
    }

    // Re-sort the unioned rows by createdAt desc (each kind was already
    // sorted, but merging requires a single ordering pass).
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const filtered = q.stuckOnly ? rows.filter((r) => r.stuck) : rows;
    res.json({
      results: filtered,
      total: filtered.length,
      stuckCount: rows.filter((r) => r.stuck).length,
    });
  } catch (e) {
    next(e);
  }
});

// Per-lead detail (admin view — masked PII).
const detailParams = z.object({
  kind: z.enum(['general', 'buyer', 'trade-in']),
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
        res.json({
          id: row.id,
          kind: 'buyer' as const,
          name: row.name,
          phoneMasked: maskPhone(decryptPii(row.phoneEnc)),
          emailMasked: maskEmail(decryptPii(row.emailEnc)),
          city: row.city,
          pincode: row.pincode,
          message: row.message,
          status: row.status,
          stuck: isStuck(row.status, row.createdAt),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          dealer: row.dealer,
          listing: row.listing
            ? { ...row.listing, price: Number(row.listing.price) }
            : null,
        });
        return;
      }
      if (kind === 'general') {
        const row = await prisma.generalLead.findUnique({
          where: { id },
          include: { dealer: { select: { id: true, name: true, city: true } } },
        });
        if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
        res.json({
          id: row.id,
          kind: 'general' as const,
          name: row.name,
          phoneMasked: maskPhone(decryptPii(row.phoneEnc)),
          emailMasked: maskEmail(decryptPii(row.emailEnc)),
          city: row.city,
          pincode: row.pincode,
          modelInterest: row.modelInterest,
          priceRange: row.priceRange,
          status: row.status,
          stuck: isStuck(row.status, row.createdAt),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          dealer: row.dealer,
        });
        return;
      }
      const row = await prisma.tradeInLead.findUnique({
        where: { id },
        include: { dealer: { select: { id: true, name: true, city: true } } },
      });
      if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
      res.json({
        id: row.id,
        kind: 'trade-in' as const,
        name: row.username,
        phoneMasked: maskPhone(decryptPii(row.phoneEnc)),
        emailMasked: maskEmail(decryptPii(row.emailEnc)),
        city: row.city,
        bikeModel: row.bikeModel,
        vin: row.vin,
        status: row.status,
        stuck: isStuck(row.status, row.createdAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        dealer: row.dealer,
      });
    } catch (e) {
      next(e);
    }
  },
);
