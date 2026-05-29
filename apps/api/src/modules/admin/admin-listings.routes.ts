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
import {
  emailProvider,
  dealerListingApprovedEmail,
  dealerListingRemovedEmail,
} from '../email/email.module.js';
import { normalizeCpoDocs, normalizeInspectionUrl } from '../../utils/docUrl.js';
import { rootVin } from '../../utils/vin.js';

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

// `status` accepts a single value (legacy) OR a comma-separated list
// (e.g. "DEACTIVATED,REMOVED" for the admin Inactive tab that bundles
// both off-market states). The transform splits, trims, and validates
// each value against the listingStatus enum so an unknown token still
// 400s cleanly.
const listQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      const parsed = parts.map((p) => {
        const r = listingStatus.safeParse(p);
        if (!r.success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown status: ${p}` });
          return null;
        }
        return r.data;
      });
      return parsed.filter((v): v is ListingStatus => v !== null);
    }),
  q: z.string().optional(),
});
const idParam = z.object({ id: z.string().min(1) });
// Reason kept on the schema but lowered to 0-char allowed so the admin
// "Remove" flow can fire as a simple Yes/Cancel confirm (no Reason input).
// The client now sends a fixed default ("Removed by admin") when the modal
// is the simplified one, but if a future UI wants to capture a reason it
// can still pass any non-empty string up to 500 chars.
const removeBody = z.object({ reason: z.string().max(500).default('') });
const returnBody = z.object({ feedback: z.string().min(5).max(1000) });

adminListingsRouter.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as { status?: ListingStatus[]; q?: string };
    const statuses = q.status ?? [];
    const where = {
      ...(statuses.length === 1
        ? { status: statuses[0] }
        : statuses.length > 1
        ? { status: { in: statuses } }
        : {}),
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
        // Strip retire-prefix sentinel so admins see the original 17-char
        // VIN even on SOLD/REMOVED rows whose stored vin was retired by a
        // re-list. Audit log line 74 in dealer-listings.routes.ts still
        // captures the raw value for forensic trace.
        vin: rootVin(l.vin),
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
      // Same retire-prefix strip as the list payload above — admin
      // preview drawer should see the clean 17-char VIN.
      vin: rootVin(row.vin),
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

      const beforeRaw = (await prisma.listing.findUnique({
        where: { id },
        select: {
          id: true,
          dealerId: true,
          status: true,
          images: true,
          inspectionReportUrl: true,
          year: true,
          modelName: true,
        },
      })) as
        | {
            id: string;
            dealerId: string;
            status: ListingStatus;
            images: string[];
            inspectionReportUrl: string | null;
            year: number;
            modelName: string;
          }
        | null;
      if (!beforeRaw) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
      // Derive the human bike label once for the removal email below.
      const before = { ...beforeRaw, bikeLabel: `${beforeRaw.year} ${beforeRaw.modelName}` };

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
          // Trigger #5: listing rejected / removed by admin, with reason.
          // Uses the shared branded template; the reason text comes from
          // the admin's modal (defaults to "Removed by admin").
          const msg = dealerListingRemovedEmail({
            dealerName: dealer.name,
            bikeLabel: before.bikeLabel,
            reason: reason || 'Removed by admin',
          });
          await emailProvider().send({ ...msg, to: dealer.email });
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
        select: { id: true, status: true, vin: true, dealerId: true, year: true, modelName: true },
      })) as { id: string; status: ListingStatus; vin: string; dealerId: string; year: number; modelName: string } | null;
      if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
      if (existing.status !== 'DRAFT') {
        throw new HttpError(409, 'INVALID_STATE', `Only DRAFT listings can be published (current: ${existing.status})`);
      }
      // Belt-and-braces VIN duplicate guard at the publish gate. Catches
      // every shape of "another bike already owns this VIN":
      //
      //   ACTIVE / DEACTIVATED  →  someone is already live with this VIN
      //   DRAFT                 →  another pending bike is queued for the
      //                            same VIN; admin must reject one before
      //                            approving the other (ticket #1)
      //
      // SOLD / REMOVED rows are intentionally NOT in this list: the
      // retire-prefix logic in createListing would have already moved
      // their stored vin off the clean value, so a real conflict against
      // them can only happen if two pending listings share a root VIN
      // (which the DRAFT branch above catches).
      //
      // Compares both the stored VIN (which may carry a `removed:cmid:`
      // retire-prefix) and the root VIN against every other DRAFT /
      // ACTIVE / DEACTIVATED listing.
      const rootVin = existing.vin.replace(/^(removed|sold|deactivated):[^:]+:/, '');
      // QA data-integrity fix: the previous query compared each OTHER
      // row's STORED vin against the clean rootVin only — so a row whose
      // vin carries a retire-prefix (e.g. a DEACTIVATED listing stored as
      // `deactivated:<id>:<rootVin>`) never matched, and the admin could
      // publish a DRAFT sharing that root VIN, leaving two live-ish
      // listings for the same physical bike. We now also match any
      // retire-prefixed form that ENDS with `:<rootVin>`, so a
      // DEACTIVATED (or DRAFT/ACTIVE) row holding the same root VIN in
      // any stored shape is caught.
      const conflict = (await prisma.listing.findFirst({
        where: {
          OR: [
            { vin: existing.vin },
            { vin: rootVin },
            { vin: { endsWith: `:${rootVin}` } },
          ],
          id: { not: id },
          status: { in: ['DRAFT', 'ACTIVE', 'DEACTIVATED'] },
        },
        select: { id: true, status: true, vin: true },
      })) as { id: string; status: ListingStatus; vin: string } | null;
      if (conflict) {
        // Tailor the message + code to the conflict shape so the admin
        // panel can surface the right action ("reject the other pending
        // bike" vs "mark the existing live one Sold").
        if (conflict.status === 'DRAFT') {
          throw new HttpError(
            409,
            'VIN_PENDING_DUPLICATE',
            `VIN ${rootVin} is already in use by another pending listing. Approve only one of the two — reject the duplicate first.`,
          );
        }
        throw new HttpError(
          409,
          'VIN_ALREADY_PUBLISHED',
          `VIN ${rootVin} is already in use by another live listing (status: ${conflict.status}). Mark the existing one Sold or Removed before publishing this one.`,
        );
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
      // Trigger #4: listing approved → notify the dealer it's now LIVE.
      // Fire-and-forget — a mail failure must not fail the publish.
      void (async () => {
        try {
          const dealer = (await prisma.dealer.findUnique({
            where: { id: existing.dealerId },
            select: { email: true, name: true },
          })) as { email: string; name: string } | null;
          if (dealer?.email) {
            const msg = dealerListingApprovedEmail({
              dealerName: dealer.name,
              bikeLabel: `${existing.year} ${existing.modelName}`,
            });
            await emailProvider().send({ ...msg, to: dealer.email });
          }
        } catch (e) {
          logger.warn({ err: e, dealerId: existing.dealerId }, 'Listing-approved email failed');
        }
      })();
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
