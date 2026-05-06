import { Router } from 'express';
import { z } from 'zod';
import { listingStatus, type ListingStatus } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { audit } from '../audit/audit.service.js';
import { torque } from '../torque/torque.module.js';

interface AdminListingRow {
  id: string;
  vin: string;
  modelName: string;
  year: number;
  price: { toString(): string };
  certificationStatus: 'CPO' | 'AS_IS';
  status: ListingStatus;
  publishedAt: Date | null;
  createdAt: Date;
  images: string[];
  dealer: { id: string; name: string };
}

export const adminListingsRouter = Router();
adminListingsRouter.use(requireAuth(['ADMIN']));

const listQuery = z.object({ status: listingStatus.optional(), q: z.string().optional() });
const idParam = z.object({ id: z.string().min(1) });
const removeBody = z.object({ reason: z.string().min(3).max(500) });
const returnBody = z.object({ feedback: z.string().min(5).max(1000) });

adminListingsRouter.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as { status?: ListingStatus; q?: string };
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { vin: { contains: q.q, mode: 'insensitive' as const } },
              { modelName: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const rows = (await prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { dealer: { select: { id: true, name: true } } },
    })) as unknown as AdminListingRow[];
    res.json(
      rows.map((l) => ({
        id: l.id,
        vin: l.vin,
        modelName: l.modelName,
        year: l.year,
        price: Number(l.price),
        certificationStatus: l.certificationStatus,
        status: l.status,
        primaryImage: l.images[0] ?? null,
        publishedAt: l.publishedAt?.toISOString() ?? null,
        createdAt: l.createdAt.toISOString(),
        dealerId: l.dealer.id,
        dealerName: l.dealer.name,
      })),
    );
  } catch (e) {
    next(e);
  }
});

// Admin preview — full detail for any status (DRAFT included). The public
// /listings/:slug route 404s on non-ACTIVE so it cannot be reused for
// pre-publish review; this endpoint is the admin-only equivalent.
interface AdminListingDetailRow {
  id: string;
  slug: string;
  vin: string;
  modelFamily: string;
  modelName: string;
  year: number;
  colour: string;
  price: { toString(): string };
  kmsDriven: number;
  description: string | null;
  images: string[];
  certificationStatus: 'CPO' | 'AS_IS';
  inspectionReportUrl: string | null;
  cpoDocs: unknown;
  status: ListingStatus;
  adminFeedback: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  dealer: { id: string; name: string; city: string; phone: string | null };
}

adminListingsRouter.get('/:id', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const row = (await prisma.listing.findUnique({
      where: { id },
      include: { dealer: { select: { id: true, name: true, city: true, phone: true } } },
    })) as unknown as AdminListingDetailRow | null;
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
    res.json({
      id: row.id,
      slug: row.slug,
      vin: row.vin,
      modelFamily: row.modelFamily,
      modelName: row.modelName,
      year: row.year,
      colour: row.colour,
      price: Number(row.price),
      kmsDriven: row.kmsDriven,
      description: row.description,
      images: row.images,
      certificationStatus: row.certificationStatus,
      inspectionReportUrl: row.inspectionReportUrl,
      cpoDocs: row.cpoDocs,
      status: row.status,
      adminFeedback: row.adminFeedback,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      dealer: row.dealer,
    });
  } catch (e) {
    next(e);
  }
});

// PRD §6.3.4 — Remove listing (hard hide). Notifies dealer with reason.
// (Notification firing wires up via the email module; payload is the reason string.)
adminListingsRouter.post(
  '/:id/remove',
  validate(idParam, 'params'),
  validate(removeBody),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason: string };
      const listing = await prisma.listing.update({
        where: { id },
        data: { status: 'REMOVED' },
      });
      await audit({
        actorId: req.auth!.sub,
        actorRole: 'ADMIN',
        action: 'LISTING_REMOVED',
        entityType: 'Listing',
        entityId: id,
        metadata: { reason },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      res.json({ id: listing.id, status: listing.status });
    } catch (e) {
      next(e);
    }
  },
);

// Admin-only publish gate. Dealers create DRAFT listings; an admin reviews and
// promotes to ACTIVE so it becomes visible to buyers. PRD §7.1 — sync to Torque.
adminListingsRouter.post(
  '/:id/publish',
  validate(idParam, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const existing = (await prisma.listing.findUnique({
        where: { id },
        select: { id: true, status: true, vin: true, dealerId: true },
      })) as { id: string; status: ListingStatus; vin: string; dealerId: string } | null;
      if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
      if (existing.status !== 'DRAFT') {
        throw new HttpError(409, 'INVALID_STATE', `Only DRAFT listings can be published (current: ${existing.status})`);
      }
      const listing = await prisma.listing.update({
        where: { id },
        data: { status: 'ACTIVE', publishedAt: new Date() },
      });
      // Best-effort Torque sync — don't block the publish on Torque availability.
      try {
        await torque.updateVehicleStatus(existing.vin, 'AVAILABLE');
      } catch (e) {
        logger.warn({ err: e, vin: existing.vin }, 'Torque status push failed; will retry');
      }
      await audit({
        actorId: req.auth!.sub,
        actorRole: 'ADMIN',
        action: 'LISTING_PUBLISHED',
        entityType: 'Listing',
        entityId: id,
        metadata: { dealerId: existing.dealerId, vin: existing.vin },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      res.json({ id: listing.id, status: listing.status, publishedAt: listing.publishedAt });
    } catch (e) {
      next(e);
    }
  },
);

// PRD §6.3.4 extension — third path between Publish and Remove. Keeps the
// listing in DRAFT but stamps the dealer-visible feedback so they know what
// to fix and can resubmit.
adminListingsRouter.post(
  '/:id/return-to-dealer',
  validate(idParam, 'params'),
  validate(returnBody),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { feedback } = req.body as { feedback: string };
      const existing = (await prisma.listing.findUnique({
        where: { id },
        select: { id: true, status: true, dealerId: true },
      })) as { id: string; status: ListingStatus; dealerId: string } | null;
      if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
      if (existing.status !== 'DRAFT') {
        throw new HttpError(
          409,
          'INVALID_STATE',
          `Only DRAFT listings can be returned (current: ${existing.status})`,
        );
      }
      const listing = await prisma.listing.update({
        where: { id },
        data: { adminFeedback: feedback },
      });
      await audit({
        actorId: req.auth!.sub,
        actorRole: 'ADMIN',
        action: 'LISTING_RETURNED_TO_DEALER',
        entityType: 'Listing',
        entityId: id,
        metadata: { dealerId: existing.dealerId, feedback },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      res.json({ id: listing.id, status: listing.status });
    } catch (e) {
      next(e);
    }
  },
);

adminListingsRouter.post('/:id/deactivate', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const listing = await prisma.listing.update({
      where: { id },
      data: { status: 'DEACTIVATED' },
    });
    await audit({
      actorId: req.auth!.sub,
      actorRole: 'ADMIN',
      action: 'LISTING_DEACTIVATED',
      entityType: 'Listing',
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    res.json({ id: listing.id, status: listing.status });
  } catch (e) {
    next(e);
  }
});
