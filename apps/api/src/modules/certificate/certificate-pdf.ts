// Certificate PDF generator — produces an A4 landscape PDF matching
// the H-D Certified certificate design (thick black border, H-D CERTIFIED
// heading, gold seal, light-blue MODEL/REGISTRATION/footer highlight bars,
// orange-circle bullet rows).
//
// Returns null when any of the three required dynamic fields is missing
// (registrationNumber, inspectedBy, certifiedOn) — the route turns that
// into a 404 so the buyer never sees a blank certificate.

import PDFDocument from 'pdfkit';

export interface CertificatePdfFields {
  slug: string;
  modelName: string;
  modelFamily: string;
  registrationNumber: string | null | undefined;
  inspectedBy: string | null | undefined;
  certifiedOn: Date | null | undefined;
}

function fmt(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}

/**
 * Build a PDFKit document with the H-D Certified certificate design.
 * Returns null if any required field is missing. Caller is responsible
 * for piping doc to the response and calling doc.end().
 */
export function generateCertificatePdf(fields: CertificatePdfFields): PDFKit.PDFDocument | null {
  const { slug, modelName, modelFamily, registrationNumber, inspectedBy, certifiedOn } = fields;
  if (!registrationNumber || !inspectedBy || !certifiedOn) return null;

  // A4 landscape: ~842 × 595 pt. We layout to roughly match the 900×640 SVG
  // by scaling X/Y proportionally to the page.
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: 'H-D Certified Certificate',
      Author: 'H-D Certified Marketplace',
      Subject: `Certificate for ${modelName} ${modelFamily}`,
    },
  });

  const W = doc.page.width;   // ~842
  const H = doc.page.height;  // ~595

  // Palette
  const BLACK = '#000000';
  const ORANGE = '#FF6600';
  const LAVENDER = '#E8EAF8';
  const GOLD = '#D4AF37';
  const GOLD_LIGHT = '#F5D76E';
  const GOLD_DARK = '#8B6914';
  const SHIELD_DARK = '#1a1a1a';
  const GREY = '#888888';
  const BODY = '#222222';

  // ── Thick black border ──────────────────────────────────────────────
  doc.lineWidth(8).strokeColor(BLACK).rect(8, 8, W - 16, H - 16).stroke();

  // ── Top-left: H-D CERTIFIED ────────────────────────────────────────
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(38).text('H–D CERTIFIED', 36, 36, { lineBreak: false });
  // small orange ™ superscript
  doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(13).text('TM', 320, 38, { lineBreak: false });
  // Subtitle
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(13).text('PRE-OWNED HARLEY-DAVIDSON®', 36, 84, { lineBreak: false });
  // Orange underline bar
  doc.fillColor(ORANGE).rect(36, 104, 150, 5).fill();

  // ── Top-right: Gold seal ───────────────────────────────────────────
  const cx = W - 90;
  const cy = 105;
  // Outer gold disk
  doc.fillColor(GOLD).strokeColor(GOLD_DARK).lineWidth(2).circle(cx, cy, 65).fillAndStroke();
  // Inner lighter ring
  doc.fillColor(GOLD_LIGHT).strokeColor(GOLD_DARK).lineWidth(1).circle(cx, cy, 54).fillAndStroke();
  // Bar & Shield (simplified)
  const sx = cx - 22;
  const sy = cy - 30;
  doc.fillColor(SHIELD_DARK).moveTo(cx, sy)
    .lineTo(cx + 22, sy + 10)
    .lineTo(cx + 22, sy + 36)
    .quadraticCurveTo(cx + 22, sy + 58, cx, sy + 68)
    .quadraticCurveTo(cx - 22, sy + 58, cx - 22, sy + 36)
    .lineTo(cx - 22, sy + 10)
    .closePath()
    .fill();
  // Orange bar across shield
  doc.fillColor(ORANGE).rect(sx, sy + 28, 44, 12).fill();
  // H-D wordmark on bar
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text('H-D', sx, sy + 31, { width: 44, align: 'center', lineBreak: false });
  // MOTOR / CYCLES
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(5.5).text('MOTOR', sx, sy + 20, { width: 44, align: 'center', lineBreak: false });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(5.5).text('CYCLES', sx, sy + 44, { width: 44, align: 'center', lineBreak: false });
  // Seal label (straight-line fallback — PDFKit has no native curved text)
  doc.fillColor(GOLD_DARK).font('Helvetica-Bold').fontSize(6.5).text(
    '12 MONTH GUARANTEE',
    cx - 60, cy - 48,
    { width: 120, align: 'center', lineBreak: false },
  );
  doc.fillColor(GOLD_DARK).font('Helvetica-Bold').fontSize(6.5).text(
    '& ROADSIDE ASSISTANCE',
    cx - 60, cy + 42,
    { width: 120, align: 'center', lineBreak: false },
  );

  // ── Body paragraph ─────────────────────────────────────────────────
  doc.fillColor(BODY).font('Helvetica').fontSize(12).text(
    'This is to certify that the following motorcycle has been thoroughly inspected and ' +
    'reconditioned by a qualified H-D® technician and is backed by a comprehensive minimum ' +
    '12 month guarantee.',
    36, 150,
    { width: W - 220 },
  );

  // ── MODEL row (lavender highlight) ─────────────────────────────────
  let y = 215;
  doc.fillColor(LAVENDER).rect(36, y, W - 72, 52).fill();
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('MODEL:', 50, y + 8, { lineBreak: false });
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(22).text(
    `${modelName} ${modelFamily}`, 50, y + 24, { width: W - 100, lineBreak: false },
  );

  // ── REGISTRATION row (lavender highlight) ──────────────────────────
  y = 275;
  doc.fillColor(LAVENDER).rect(36, y, W - 72, 52).fill();
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('REGISTRATION:', 50, y + 8, { lineBreak: false });
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(22).text(
    registrationNumber, 50, y + 24, { width: W - 100, lineBreak: false },
  );

  // ── FEATURES header ────────────────────────────────────────────────
  y = 350;
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(13).text(
    'FEATURES OF THIS CERTIFIED MACHINE', 36, y, { lineBreak: false },
  );

  // ── Four bullets: orange circle with white star ────────────────────
  const features: Array<[string, string]> = [
    ['12 MONTHS ROADSIDE ASSISTANCE', 'COMPREHENSIVE 12 MONTH GUARANTEE'],
    ['110-POINT QUALITY ASSURANCE INSPECTION', 'ACCESS TO H.O.G.® MEMBERSHIP'],
  ];
  let fy = 380;
  for (const [left, right] of features) {
    // Left circle + star
    doc.fillColor(ORANGE).circle(50, fy + 6, 10).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('*', 44, fy, { width: 12, align: 'center', lineBreak: false });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(left, 68, fy + 2, { width: 360, lineBreak: false });
    // Right circle + star
    doc.fillColor(ORANGE).circle(W / 2 + 10, fy + 6, 10).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('*', W / 2 + 4, fy, { width: 12, align: 'center', lineBreak: false });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(right, W / 2 + 28, fy + 2, { width: 360, lineBreak: false });
    fy += 30;
  }

  // ── Bottom row: INSPECTED BY | CERTIFIED ON (lavender) ─────────────
  y = 470;
  doc.fillColor(LAVENDER).rect(36, y, W - 72, 52).fill();
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('INSPECTED BY:', 50, y + 8, { lineBreak: false });
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(16).text(inspectedBy, 50, y + 24, { width: W / 2 - 70, lineBreak: false });

  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('CERTIFIED ON:', W / 2 + 10, y + 8, { lineBreak: false });
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(16).text(fmt(certifiedOn), W / 2 + 10, y + 24, { width: 200, lineBreak: false });

  // ── Fine print ─────────────────────────────────────────────────────
  doc.fillColor(GREY).font('Helvetica').fontSize(8).text(
    'H-D CERTIFIED™ · PRE-OWNED HARLEY-DAVIDSON® · 12-MONTH GUARANTEE\nThis certificate is issued by an authorised Harley-Davidson dealer.',
    36, H - 45, { width: W - 72, align: 'center' },
  );

  // suppress unused-var warning for slug (kept on interface for future filename use)
  void slug;
  return doc;
}
