import PDFDocument from 'pdfkit';
import { CHECKLIST, TOTAL_POINTS } from './checklist-data.js';

// Brand tokens (mirror of packages/config/tailwind.preset.js).
const ORANGE = '#FF6600';
const BLACK = '#000000';
const GREY_DARK = '#333333';
const GREY = '#666666';
const GREY_LIGHT = '#CCCCCC';

interface ChecklistPdfOptions {
  vinPrefill?: string;
}

/**
 * Generates the H-D Certified 110-point checklist as a streamable PDF.
 * Page 1 is the cover (header + bike details + inspector sign-on). Subsequent
 * pages list each section with checkboxes for ✓ Pass / ✗ Fail / N/A and a
 * notes column. Final page has the dealer sign-off block.
 */
export function generateChecklistPdf(opts: ChecklistPdfOptions = {}): NodeJS.ReadableStream {
  const doc = new PDFDocument({ size: 'A4', margin: 36, info: {
    Title: 'H-D Certified 110-Point Inspection Checklist',
    Author: 'H-D Certified',
    Subject: 'Pre-delivery inspection',
  } });

  // ─── Cover page ───────────────────────────────────────────────
  // Black header band
  doc.rect(0, 0, doc.page.width, 80).fill(BLACK);
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('H-D ', 36, 28, { continued: true })
    .fillColor(ORANGE)
    .text('CERTIFIED', { continued: false });
  doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica').text('110-Point Pre-Delivery Inspection', 36, 56);

  // Page body
  doc.moveDown(4);
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(20).text('Inspection Worksheet', 36, 110);
  doc.fillColor(GREY).font('Helvetica').fontSize(10).text(
    'Complete every point. Tick PASS, FAIL, or N/A. Use the notes column for any deviation. ' +
    'A bike qualifies for H-D Certified status only when all 110 points pass; otherwise it is sold AS-IS.',
    36, 140, { width: doc.page.width - 72, align: 'left' },
  );

  // Bike details box
  drawDetailsBox(doc, 36, 200, opts.vinPrefill);

  // Inspector sign-on
  drawSignOnBox(doc, 36, 360);

  // Footer
  doc
    .fillColor(GREY)
    .fontSize(8)
    .text('Page 1 / TBD', 36, doc.page.height - 50, { align: 'left' })
    .text('H-D Certified · Confidential', 36, doc.page.height - 50, { align: 'right' });

  // ─── Checklist sections ────────────────────────────────────────
  let pointCounter = 0;
  CHECKLIST.forEach((section) => {
    doc.addPage();
    drawCompactHeader(doc);

    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(14).text(section.title, 36, 80);
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(
      `${section.points.length} points`,
      36, 100,
    );

    // Column header
    const startY = 130;
    drawRow(doc, startY, '#', 'Inspection Point', 'Pass', 'Fail', 'N/A', 'Notes', true);

    let y = startY + 22;
    section.points.forEach((point) => {
      pointCounter += 1;
      drawRow(doc, y, String(pointCounter), point, '☐', '☐', '☐', '');
      y += 26;
      // Add page break if running out of room
      if (y > doc.page.height - 100) {
        doc.addPage();
        drawCompactHeader(doc);
        y = 80;
        drawRow(doc, y, '#', 'Inspection Point', 'Pass', 'Fail', 'N/A', 'Notes', true);
        y += 22;
      }
    });
  });

  // ─── Sign-off page ────────────────────────────────────────────
  doc.addPage();
  drawCompactHeader(doc);
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(16).text('Final Sign-Off', 36, 90);
  doc.fillColor(GREY).font('Helvetica').fontSize(10).text(
    'By signing below, the inspecting technician and dealer principal certify that the bike has ' +
    'been inspected to the H-D Certified 110-point standard and the results recorded above are ' +
    'accurate.',
    36, 115, { width: doc.page.width - 72 },
  );

  drawSignatureBlock(doc, 36, 200, 'Inspecting Technician');
  drawSignatureBlock(doc, 36, 320, 'Dealer Principal');
  drawSignatureBlock(doc, 36, 440, 'Customer (acknowledgement)');

  // Outcome
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('Inspection Outcome', 36, 580);
  doc.lineWidth(1).strokeColor(BLACK);
  doc.rect(36, 600, 18, 18).stroke();
  doc.font('Helvetica').fontSize(10).fillColor(BLACK).text('All 110 points passed — qualifies for H-D Certified', 62, 604);
  doc.rect(36, 626, 18, 18).stroke();
  doc.text('One or more points failed — sold AS-IS', 62, 630);

  doc.fillColor(GREY).font('Helvetica-Oblique').fontSize(8).text(
    `Total points covered in this checklist: ${TOTAL_POINTS}`,
    36, doc.page.height - 60,
  );

  doc.end();
  return doc;
}

// ─── helpers ────────────────────────────────────────────────────────────

function drawCompactHeader(doc: PDFKit.PDFDocument) {
  doc.rect(0, 0, doc.page.width, 50).fill(BLACK);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('H-D ', 36, 18, { continued: true });
  doc.fillColor(ORANGE).text('CERTIFIED', { continued: false });
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8).text('110-Point Inspection Worksheet', 36, 34);
}

function drawDetailsBox(doc: PDFKit.PDFDocument, x: number, y: number, vinPrefill?: string) {
  const width = doc.page.width - 72;
  doc.lineWidth(1).strokeColor(GREY_LIGHT).rect(x, y, width, 140).stroke();
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('Bike Details', x + 12, y + 10);

  drawField(doc, x + 12, y + 35, 'VIN', vinPrefill ?? '', 240);
  drawField(doc, x + 270, y + 35, 'Year', '', 80);
  drawField(doc, x + 360, y + 35, 'Odometer (km)', '', 130);

  drawField(doc, x + 12, y + 70, 'Model Family', '', 240);
  drawField(doc, x + 270, y + 70, 'Model', '', 220);

  drawField(doc, x + 12, y + 105, 'Colour', '', 240);
  drawField(doc, x + 270, y + 105, 'Service History (km)', '', 220);
}

function drawSignOnBox(doc: PDFKit.PDFDocument, x: number, y: number) {
  const width = doc.page.width - 72;
  doc.lineWidth(1).strokeColor(GREY_LIGHT).rect(x, y, width, 90).stroke();
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text('Inspecting Technician', x + 12, y + 10);

  drawField(doc, x + 12, y + 35, 'Name', '', 200);
  drawField(doc, x + 230, y + 35, 'Tech ID', '', 100);
  drawField(doc, x + 350, y + 35, 'Date', '', 130);

  drawField(doc, x + 12, y + 65, 'Dealer Code', '', 200);
  drawField(doc, x + 230, y + 65, 'Workshop', '', 250);
}

function drawField(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, width = 150) {
  doc.fillColor(GREY).font('Helvetica').fontSize(7).text(label.toUpperCase(), x, y);
  doc.lineWidth(0.7).strokeColor(GREY_LIGHT).moveTo(x, y + 18).lineTo(x + width, y + 18).stroke();
  if (value) {
    doc.fillColor(BLACK).font('Helvetica').fontSize(10).text(value, x, y + 8);
  }
}

function drawRow(
  doc: PDFKit.PDFDocument,
  y: number,
  num: string,
  point: string,
  pass: string,
  fail: string,
  na: string,
  notes: string,
  header = false,
) {
  const cols = { num: 36, point: 70, pass: 320, fail: 365, na: 405, notes: 440 };
  const widthNotes = doc.page.width - cols.notes - 36;

  if (header) {
    doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8);
  } else {
    doc.fillColor(BLACK).font('Helvetica').fontSize(9);
  }
  doc.text(num, cols.num, y, { width: 28 });
  doc.text(point, cols.point, y, { width: 240 });
  doc.text(pass, cols.pass, y, { width: 30, align: 'center' });
  doc.text(fail, cols.fail, y, { width: 30, align: 'center' });
  doc.text(na, cols.na, y, { width: 30, align: 'center' });
  if (header) {
    doc.text(notes, cols.notes, y, { width: widthNotes });
  } else {
    // notes underline
    doc.lineWidth(0.5).strokeColor(GREY_LIGHT).moveTo(cols.notes, y + 12).lineTo(cols.notes + widthNotes, y + 12).stroke();
  }

  if (header) {
    doc
      .lineWidth(0.5)
      .strokeColor(GREY_DARK)
      .moveTo(36, y + 16)
      .lineTo(doc.page.width - 36, y + 16)
      .stroke();
  }
}

function drawSignatureBlock(doc: PDFKit.PDFDocument, x: number, y: number, role: string) {
  const width = doc.page.width - 72;
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(11).text(role, x, y);
  drawField(doc, x, y + 25, 'Name', '', 220);
  drawField(doc, x + 240, y + 25, 'Date', '', 130);
  drawField(doc, x + 390, y + 25, 'Signature', '', width - 390);
}
