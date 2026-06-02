// Certificate routes — public, no auth required.
// GET /api/v1/listings/:slug/certificate.png  → PNG image
// GET /api/v1/listings/:slug/certificate.pdf  → PDF document
//
// Both return 404 if:
//   - listing not found
//   - listing not ACTIVE
//   - certificationStatus !== 'CPO'
//   - any of registrationNumber / inspectedBy / certifiedOn is null

import { Router } from 'express';
import sharp from 'sharp';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';
import { generateCertificateSvg } from './certificate-svg.js';
import { generateCertificatePdf } from './certificate-pdf.js';

export const certificateRouter = Router();

// ── shared helper ──────────────────────────────────────────────────────────

async function resolveListing(slug: string) {
  // Prisma types may not yet reflect the new columns (prisma generate hasn't
  // run in CI), so we cast the result to include them.
  const row = await (prisma.listing.findUnique as Function)({
    where: { slug },
    select: {
      id: true,
      slug: true,
      modelName: true,
      modelFamily: true,
      certificationStatus: true,
      status: true,
      registrationNumber: true,
      inspectedBy: true,
      certifiedOn: true,
    },
  }) as {
    id: string;
    slug: string;
    modelName: string;
    modelFamily: string;
    certificationStatus: string;
    status: string;
    registrationNumber: string | null;
    inspectedBy: string | null;
    certifiedOn: Date | null;
  } | null;

  if (!row || row.status !== 'ACTIVE' || row.certificationStatus !== 'CPO') {
    throw new HttpError(404, 'NOT_FOUND', 'Certificate not found for this listing');
  }

  return row;
}

// ── PNG ────────────────────────────────────────────────────────────────────

certificateRouter.get('/:slug/certificate.png', async (req, res, next) => {
  try {
    const row = await resolveListing(req.params.slug);
    const svg = generateCertificateSvg({
      modelName: row.modelName,
      modelFamily: row.modelFamily,
      registrationNumber: row.registrationNumber,
      inspectedBy: row.inspectedBy,
      certifiedOn: row.certifiedOn,
    });
    if (!svg) {
      throw new HttpError(404, 'NOT_FOUND', 'Certificate not yet generated — registration number and inspection details required');
    }
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(png.length),
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(png);
  } catch (e) {
    next(e);
  }
});

// ── PDF ────────────────────────────────────────────────────────────────────

certificateRouter.get('/:slug/certificate.pdf', async (req, res, next) => {
  try {
    const row = await resolveListing(req.params.slug);
    const doc = generateCertificatePdf({
      slug: row.slug,
      modelName: row.modelName,
      modelFamily: row.modelFamily,
      registrationNumber: row.registrationNumber,
      inspectedBy: row.inspectedBy,
      certifiedOn: row.certifiedOn,
    });
    if (!doc) {
      throw new HttpError(404, 'NOT_FOUND', 'Certificate not yet generated — registration number and inspection details required');
    }
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hd-certified-${row.slug}.pdf"`,
      'Cache-Control': 'public, max-age=3600',
    });
    doc.pipe(res);
    doc.end();
  } catch (e) {
    next(e);
  }
});
