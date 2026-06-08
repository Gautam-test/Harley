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

  if (!row) {
    throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
  }
  if (row.certificationStatus !== 'CPO') {
    throw new HttpError(404, 'NOT_CPO', 'Certificate only available for CPO listings');
  }
  // QA BUG-043/044 hardening: only ACTIVE (LIVE) listings expose the
  // certificate. Previously DRAFT + DEACTIVATED were allowed so the
  // dealer could preview their own draft, but that left the endpoint
  // open — a guessed slug returned a real cert even though the wizard
  // UI hid the View / Download CTAs. Frontend now also blocks the
  // Preview action with a toast, so this is the matching backend gate.
  // Defence-in-depth: even if a future UI bug re-exposes the button,
  // the API will still reject.
  if (row.status !== 'ACTIVE') {
    throw new HttpError(
      404,
      'NOT_ACTIVE',
      'Certificate viewing will be available once the motorcycle listing is live.',
    );
  }
  // Surface a clear message when the required cert metadata is missing
  // so the dealer can see exactly what to fill in to get the cert.
  const missing: string[] = [];
  if (!row.registrationNumber) missing.push('registration number');
  if (!row.inspectedBy) missing.push('inspector name');
  if (!row.certifiedOn) missing.push('certified-on date');
  if (missing.length > 0) {
    throw new HttpError(
      404,
      'CERT_INCOMPLETE',
      `Certificate cannot be generated — missing: ${missing.join(', ')}. Complete the listing details to enable certificate.`,
    );
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
