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
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';
import { generateCertificateSvg } from './certificate-svg.js';

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

  return { row, svg };
}

// ── PNG ────────────────────────────────────────────────────────────────────

certificateRouter.get('/:slug/certificate.png', async (req, res, next) => {
  try {
    const { svg } = await resolveListing(req.params.slug);
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
    const { row } = await resolveListing(req.params.slug);

    // Build PDF using PDFKit — same pattern as checklist-pdf.ts.
    const doc = new PDFDocument({ size: 'A4', margin: 36, info: {
      Title: 'H-D Certified Certificate',
      Author: 'H-D Certified Marketplace',
      Subject: `Certificate for ${row.modelName} ${row.modelFamily}`,
    }});

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hd-certified-${row.slug}.pdf"`,
      'Cache-Control': 'public, max-age=3600',
    });

    doc.pipe(res);

    const ORANGE = '#FF6600';
    const BLACK = '#000000';
    const GOLD = '#C9A800';
    const GREY = '#555555';
    const W = doc.page.width;

    // ── Outer border ──────────────────────────────────────────────────
    doc.lineWidth(6).strokeColor(BLACK).rect(10, 10, W - 20, doc.page.height - 20).stroke();
    doc.lineWidth(1.5).strokeColor(BLACK).rect(18, 18, W - 36, doc.page.height - 36).stroke();

    // ── Top-left: H-D CERTIFIED™ ──────────────────────────────────────
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(28).text('H–D CERTIFIED™', 36, 45, { continued: false });
    doc.fillColor(BLACK).font('Helvetica').fontSize(11).text('PRE-OWNED HARLEY-DAVIDSON®', 36, 80);
    doc.lineWidth(3).strokeColor(ORANGE).moveTo(36, 95).lineTo(280, 95).stroke();

    // ── Top-right: Gold seal (circle) ────────────────────────────────
    const cx = W - 90;
    const cy = 90;
    doc.lineWidth(2).strokeColor(GOLD).circle(cx, cy, 66).stroke();
    doc.lineWidth(1).strokeColor(GOLD).circle(cx, cy, 59).stroke();
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(7).text(
      '12 MONTH GUARANTEE\n& ROADSIDE ASSISTANCE',
      cx - 40, cy - 12,
      { width: 80, align: 'center' },
    );

    // ── Body text ─────────────────────────────────────────────────────
    doc.fillColor(GREY).font('Helvetica').fontSize(10).text(
      'This is to certify that the following motorcycle has been thoroughly inspected and ' +
      'reconditioned by a qualified H-D® technician and is backed by a comprehensive minimum ' +
      '12 month guarantee.',
      36, 115, { width: W - 72 },
    );

    doc.lineWidth(0.5).strokeColor('#cccccc').moveTo(36, 155).lineTo(W - 36, 155).stroke();

    // ── MODEL ─────────────────────────────────────────────────────────
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('MODEL:', 36, 168);
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(22).text(
      `${row.modelName} ${row.modelFamily}`, 36, 182, { width: W - 72 },
    );

    // ── REGISTRATION ──────────────────────────────────────────────────
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('REGISTRATION:', 36, 218);
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(22).text(
      row.registrationNumber ?? '', 36, 232, { width: W - 72 },
    );

    doc.lineWidth(0.5).strokeColor('#cccccc').moveTo(36, 268).lineTo(W - 36, 268).stroke();

    // ── Features header ───────────────────────────────────────────────
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(10).text(
      'FEATURES OF THIS CERTIFIED MACHINE', 36, 280,
    );

    // ── Bullet rows ───────────────────────────────────────────────────
    const starColor = ORANGE;
    const features = [
      ['12 MONTHS ROADSIDE ASSISTANCE', 'COMPREHENSIVE 12 MONTH GUARANTEE'],
      ['110-POINT QUALITY ASSURANCE INSPECTION', 'ACCESS TO H.O.G. MEMBERSHIP'],
    ];
    let fy = 300;
    for (const [left, right] of features) {
      doc.fillColor(starColor).font('Helvetica-Bold').fontSize(12).text('*', 36, fy);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9).text(left ?? '', 52, fy + 2, { width: 230 });
      doc.fillColor(starColor).font('Helvetica-Bold').fontSize(12).text('*', W / 2 + 10, fy);
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9).text(right ?? '', W / 2 + 26, fy + 2, { width: 230 });
      fy += 26;
    }

    doc.lineWidth(0.5).strokeColor('#cccccc').moveTo(36, fy + 6).lineTo(W - 36, fy + 6).stroke();

    // ── INSPECTED BY | CERTIFIED ON ───────────────────────────────────
    const labelY = fy + 22;
    const valueY = labelY + 16;

    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('INSPECTED BY:', 36, labelY);
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(14).text(row.inspectedBy ?? '', 36, valueY, { width: W / 2 - 50 });

    doc.lineWidth(0.5).strokeColor('#cccccc')
      .moveTo(W / 2, fy + 6)
      .lineTo(W / 2, valueY + 24)
      .stroke();

    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text('CERTIFIED ON:', W / 2 + 10, labelY);
    const certDate = row.certifiedOn
      ? new Date(row.certifiedOn).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      : '';
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(14).text(certDate, W / 2 + 10, valueY, { width: 200 });

    // ── Orange accent bar ─────────────────────────────────────────────
    doc.fillColor(ORANGE).rect(36, valueY + 32, W - 72, 3).fill();

    // ── Fine print ────────────────────────────────────────────────────
    doc.fillColor(GREY).font('Helvetica').fontSize(8).text(
      'H-D CERTIFIED™ · PRE-OWNED HARLEY-DAVIDSON® · 12-MONTH GUARANTEE\nThis certificate is issued by an authorised Harley-Davidson dealer.',
      36, valueY + 46, { width: W - 72, align: 'center' },
    );

    doc.end();
  } catch (e) {
    next(e);
  }
});
