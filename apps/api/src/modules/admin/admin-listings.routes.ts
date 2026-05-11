import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { listingStatus, type ListingStatus } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { audit } from '../audit/audit.service.js';
import { torque } from '../torque/torque.module.js';
import { emailProvider } from '../email/email.module.js';
import { normalizeCpoDocs, normalizeInspectionUrl } from '../../utils/docUrl.js';

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
  dealer: { id: string; name: string; city: string; pincode: string };
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
      include: {
        dealer: { select: { id: true, name: true, city: true, pincode: true } },
      },
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
        // Surface dealer location on the row so admins can scan across
        // dealers without opening the preview drawer for each listing.
        dealerCity: l.dealer.city,
        dealerPincode: l.dealer.pincode,
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
  dealer: {
    id: string;
    name: string;
    city: string;
    pincode: string;
    phone: string | null;
  };
}

adminListingsRouter.get('/:id', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const row = (await prisma.listing.findUnique({
      where: { id },
      include: {
        dealer: {
          select: { id: true, name: true, city: true, pincode: true, phone: true },
        },
      },
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
      // Repair legacy URLs (torque.mock host / bare filename) so the admin
      // preview drawer's "Open inspection PDF" link doesn't 'site can't be
      // reached' on rows seeded before the mock-doc proxy landed (QA BUG-19).
      inspectionReportUrl: normalizeInspectionUrl(row.inspectionReportUrl),
      cpoDocs: normalizeCpoDocs(row.cpoDocs),
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

// PRD §6.3.4 — Remove listing (hard hide).
//
// Three things have to happen besides flipping the status:
//   1. Persist `reason` to listing.adminFeedback so the dealer's "Removed"
//      banner shows the admin's explanation (the modal copy promises this).
//   2. Email the dealer so they don't have to discover the removal by
//      reloading their list. Best-effort — a send failure logs and moves on.
//   3. Unlink the orphaned image + inspection-PDF files from local disk
//      so /api/v1/uploads/listing-images/<filename> + /inspection/files/...
//      stop resolving and the disk doesn't grow unbounded across removes.
//      Errors per file are tolerated (ENOENT means already gone).
adminListingsRouter.post(
  '/:id/remove',
  validate(idParam, 'params'),
  validate(removeBody),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason: string };

      const before = (await prisma.listing.findUnique({
        where: { id },
        select: {
          id: true,
          dealerId: true,
          status: true,
          images: true,
          inspectionReportUrl: true,
        },
      })) as
        | {
            id: string;
            dealerId: string;
            status: ListingStatus;
            images: string[];
            inspectionReportUrl: string | null;
          }
        | null;
      if (!before) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');

      const listing = await prisma.listing.update({
        where: { id },
        data: { status: 'REMOVED', adminFeedback: reason },
      });

      // Dealer-email notification + orphan-file cleanup are awaited in
      // parallel BEFORE the response so a pm2/nodemon restart between
      // res.json and the cleanup can't leak files. Failures inside each
      // task only log — the listing is still REMOVED in the DB, that's
      // the source of truth.
      const emailNotify = async () => {
        try {
          const dealer = (await prisma.dealer.findUnique({
            where: { id: before.dealerId },
            select: { email: true, name: true },
          })) as { email: string; name: string } | null;
          if (!dealer) return;
          await emailProvider().send({
            to: dealer.email,
            subject: 'A listing has been removed by H-D Certified',
            html: `<p>Hi ${dealer.name},</p><p>One of your listings was removed by an H-D Certified admin with the following reason:</p><blockquote>${reason}</blockquote><p>Sign in to your dealer portal for details.</p>`,
            text: `Listing removed by admin. Reason: ${reason}. Sign in for details.`,
          });
        } catch (e) {
          logger.warn({ err: e, dealerId: before.dealerId }, 'Listing-removed email failed');
        }
      };

      // Storage layout matches the upload routes in
      // apps/api/src/modules/{uploads,inspection}/*.routes.ts.
      const fileCleanup = async () => {
        const UPLOAD_ROOT = path.resolve(process.cwd(), '.uploads');
        const fileTargets: string[] = [];
        for (const url of before.images) {
          const m = url.match(/\/listing-images\/([a-zA-Z0-9-]+\.[a-zA-Z0-9]+)$/);
          if (!m || !m[1]) continue;
          // The DB stores the full image URL (e.g. `<uuid>.webp`); the
          // matching `<uuid>-thumb.webp` is implied. Strip an extension
          // whether or not it's `.webp` so legacy uploads still get
          // unlinked, then derive both variants.
          const filename = m[1];
          const base = filename.includes('.')
            ? filename.slice(0, filename.lastIndexOf('.'))
            : filename;
          fileTargets.push(
            path.join(UPLOAD_ROOT, 'listing-images', `${base}.webp`),
            path.join(UPLOAD_ROOT, 'listing-images', `${base}-thumb.webp`),
            // Original filename if it wasn't .webp — covers older uploads.
            path.join(UPLOAD_ROOT, 'listing-images', filename),
          );
        }
        if (before.inspectionReportUrl) {
          const m = before.inspectionReportUrl.match(
            /\/inspection\/files\/([a-zA-Z0-9-]+\.[a-zA-Z0-9]+)$/,
          );
          if (m && m[1]) fileTargets.push(path.join(UPLOAD_ROOT, 'inspections', m[1]));
        }
        // De-dupe (the original-filename addition above can repeat the
        // .webp targets when filename === `<uuid>.webp`).
        const unique = Array.from(new Set(fileTargets));
        for (const target of unique) {
          try {
            await fs.unlink(target);
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
              logger.warn({ err, target }, 'Could not unlink file on listing remove');
            }
          }
        }
      };

      // Only nuke disk files for listings that were ACTIVE (or just-SOLD)
      // — those rows were publicly visible, so a removal is a permanent
      // takedown. For DRAFT / DEACTIVATED removes the dealer can restore
      // the row + re-submit, and the photos / inspection PDF they
      // already uploaded must survive so the wizard hydrates them.
      const filesArePublic =
        before.status === 'ACTIVE' || before.status === 'SOLD';
      await Promise.all([
        emailNotify(),
        ...(filesArePublic ? [fileCleanup()] : []),
      ]);

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

// Reactivate a previously DEACTIVATED listing — flips back to ACTIVE without
// going through the DRAFT review queue (the listing was already approved
// once; deactivation is a soft pause, not a re-removal). Best-effort Torque
// re-sync mirrors what /publish does.
adminListingsRouter.post('/:id/reactivate', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = (await prisma.listing.findUnique({
      where: { id },
      select: { id: true, status: true, vin: true, dealerId: true, publishedAt: true },
    })) as
      | { id: string; status: ListingStatus; vin: string; dealerId: string; publishedAt: Date | null }
      | null;
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
    if (existing.status !== 'DEACTIVATED') {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `Only DEACTIVATED listings can be reactivated (current: ${existing.status})`,
      );
    }
    const listing = await prisma.listing.update({
      where: { id },
      // Preserve original publishedAt if it exists so analytics keep the
      // first-published date; otherwise stamp it now (covers listings that
      // were deactivated before publishedAt was tracked).
      data: { status: 'ACTIVE', publishedAt: existing.publishedAt ?? new Date() },
    });
    try {
      await torque.updateVehicleStatus(existing.vin, 'AVAILABLE');
    } catch (e) {
      logger.warn({ err: e, vin: existing.vin }, 'Torque status push failed on reactivate');
    }
    await audit({
      actorId: req.auth!.sub,
      actorRole: 'ADMIN',
      action: 'LISTING_REACTIVATED',
      entityType: 'Listing',
      entityId: id,
      metadata: { dealerId: existing.dealerId, vin: existing.vin },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    res.json({ id: listing.id, status: listing.status });
  } catch (e) {
    next(e);
  }
});

// Restore a REMOVED listing — flips status back to DRAFT so the dealer can
// fix whatever caused the removal and resubmit through the normal review
// flow. The original removal also unlinked image + inspection files from
// disk, so the dealer will need to re-upload assets; we surface that in
// adminFeedback so they aren't surprised.
adminListingsRouter.post('/:id/restore', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const existing = (await prisma.listing.findUnique({
      where: { id },
      select: { id: true, status: true, dealerId: true, adminFeedback: true },
    })) as
      | { id: string; status: ListingStatus; dealerId: string; adminFeedback: string | null }
      | null;
    if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
    if (existing.status !== 'REMOVED') {
      throw new HttpError(
        409,
        'INVALID_STATE',
        `Only REMOVED listings can be restored (current: ${existing.status})`,
      );
    }
    const restoreNote =
      'Restored by admin — please re-upload listing images and the inspection PDF (the previous files were cleaned up on removal), then resubmit for review.';
    const listing = await prisma.listing.update({
      where: { id },
      data: {
        status: 'DRAFT',
        // publishedAt deliberately left as-is — buyer-side queries gate on
        // status === 'ACTIVE' so a stale publishedAt on a DRAFT row is harmless,
        // and clearing it would erase the audit trail of the original publish.
        adminFeedback: existing.adminFeedback
          ? `${existing.adminFeedback}\n\n${restoreNote}`
          : restoreNote,
      },
    });
    await audit({
      actorId: req.auth!.sub,
      actorRole: 'ADMIN',
      action: 'LISTING_RESTORED',
      entityType: 'Listing',
      entityId: id,
      metadata: { dealerId: existing.dealerId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    res.json({ id: listing.id, status: listing.status });
  } catch (e) {
    next(e);
  }
});
