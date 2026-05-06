import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

export const adminMetricsRouter = Router();
adminMetricsRouter.use(requireAuth(['ADMIN']));

// PRD §6.3.2 — date-ranged dashboard. Tile metrics at a glance.
const rangeQuery = z.object({
  range: z.enum(['today', '7d', '30d', 'custom']).default('7d'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function rangeToDates(input: { range: 'today' | '7d' | '30d' | 'custom'; from?: string; to?: string }) {
  const now = new Date();
  if (input.range === 'custom' && input.from && input.to) {
    return { from: new Date(input.from), to: new Date(input.to) };
  }
  const days = input.range === 'today' ? 1 : input.range === '7d' ? 7 : 30;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to: now };
}

interface TopDealer {
  dealerId: string;
  _count: { _all: number };
}

interface DealerNameRow {
  id: string;
  name: string;
}

adminMetricsRouter.get('/', validate(rangeQuery, 'query'), async (req, res, next) => {
  try {
    const { from, to } = rangeToDates(req.query as never);

    const [
      dealersByStatus,
      activeListings,
      totalListings,
      tradeInLeads,
      buyerEnquiries,
      conversions,
      topListingDealers,
      topLeadDealers,
    ] = await Promise.all([
      prisma.dealer.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.listing.count({ where: { status: 'ACTIVE' } }),
      prisma.listing.count(),
      prisma.tradeInLead.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.enquiry.count({ where: { createdAt: { gte: from, lte: to } } }),
      // Buyer pipeline terminates at SUCCESS, not CONVERTED — accept both for
      // legacy rows so historical dashboards don't lose data after the rename.
      prisma.enquiry.count({
        where: { status: { in: ['SUCCESS', 'CONVERTED'] }, createdAt: { gte: from, lte: to } },
      }),
      prisma.listing.groupBy({
        by: ['dealerId'],
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }) as unknown as Promise<TopDealer[]>,
      // Top dealers by buyer-enquiry volume — replaces the legacy generalLead
      // top-leads metric (general leads were retired May 2026).
      prisma.enquiry.groupBy({
        by: ['dealerId'],
        _count: { _all: true },
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }) as unknown as Promise<TopDealer[]>,
    ]);

    const dealerIds = [
      ...new Set([...topListingDealers, ...topLeadDealers].map((d) => d.dealerId)),
    ];
    const dealerNames = (await prisma.dealer.findMany({
      where: { id: { in: dealerIds } },
      select: { id: true, name: true },
    })) as unknown as DealerNameRow[];
    const nameById = Object.fromEntries(dealerNames.map((d) => [d.id, d.name]));

    const totalLeads = tradeInLeads + buyerEnquiries;

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      dealers: {
        byStatus: Object.fromEntries(
          (dealersByStatus as Array<{ status: string; _count: { _all: number } }>).map((d) => [
            d.status,
            d._count._all,
          ]),
        ),
      },
      listings: { active: activeListings, total: totalListings },
      leads: {
        tradeIn: tradeInLeads,
        buyerEnquiries,
        total: totalLeads,
        conversions,
        conversionPct: totalLeads === 0 ? 0 : Math.round((conversions / totalLeads) * 1000) / 10,
      },
      topDealersByListings: topListingDealers.map((d) => ({
        dealerId: d.dealerId,
        name: nameById[d.dealerId] ?? d.dealerId,
        count: d._count._all,
      })),
      topDealersByLeads: topLeadDealers.map((d) => ({
        dealerId: d.dealerId,
        name: nameById[d.dealerId] ?? d.dealerId,
        count: d._count._all,
      })),
    });
  } catch (e) {
    next(e);
  }
});
