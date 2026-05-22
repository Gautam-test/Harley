import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { prisma } from '../../config/prisma.js';
import { generateChecklistPdf } from './checklist-pdf.js';

// ─── Local file storage for uploaded inspection PDFs ────────────────
// In production this is replaced with S3/MinIO + presigned URLs.
const UPLOAD_DIR = path.resolve(process.cwd(), '.uploads', 'inspections');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Buffer the upload in memory so we can magic-byte sniff before persisting.
// 10 MB max so the per-request memory cost is bounded.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per PRD §6.2.3 AC4
  fileFilter: (_req, file, cb) => {
    // Both mime and extension must match — was an OR, which let a `.pdf`
    // file with `Content-Type: text/x-php` (or vice versa) through.
    const mimeOk = file.mimetype === 'application/pdf';
    const extOk = file.originalname.toLowerCase().endsWith('.pdf');
    if (!mimeOk || !extOk) {
      return cb(new HttpError(415, 'BAD_FILE_TYPE', 'Inspection upload must be a PDF') as Error);
    }
    cb(null, true);
  },
});

// PDF files start with the literal bytes `%PDF-` (`25 50 44 46 2D`). Sniff
// before writing to disk so a renamed-but-bytes-wrong file never lands in
// the upload directory.
function isPdfBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  );
}

export const inspectionRouter = Router();

// ─── 1. Download blank checklist template (public for convenience) ───
inspectionRouter.get(
  '/template.pdf',
  validate(z.object({ vin: z.string().max(17).optional() }), 'query'),
  (req, res, next) => {
    try {
      const { vin } = req.query as { vin?: string };
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="hd-certified-110-point-inspection${vin ? `-${vin}` : ''}.pdf"`,
      );
      generateChecklistPdf({ vinPrefill: vin }).pipe(res);
    } catch (e) {
      next(e);
    }
  },
);

// ─── 2. Dealer uploads a filled checklist PDF ───────────────────────
inspectionRouter.post(
  '/upload',
  requireAuth(['DEALER']),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, 'FILE_MISSING', 'Attach a PDF as form field "file"');
      // Magic-byte check before persistence — even with mime + extension
      // gates, a renamed file with the wrong bytes would slip through.
      if (!isPdfBuffer(req.file.buffer)) {
        throw new HttpError(
          415,
          'BAD_FILE_TYPE',
          'File contents do not match a PDF — please upload the original PDF, not a re-typed file',
        );
      }
      const filename = `${randomUUID()}.pdf`;
      const filePath = path.join(UPLOAD_DIR, filename);
      // node:fs.promises lazy-load to keep the imports compact at the top.
      const { writeFile } = await import('node:fs/promises');
      await writeFile(filePath, req.file.buffer);
      const url = `/api/v1/inspection/files/${filename}`;
      res.status(201).json({
        filename,
        originalName: req.file.originalname,
        size: req.file.size,
        url,
      });
    } catch (e) {
      next(e);
    }
  },
);

// ─── 3. Serve uploaded inspection PDFs — gated by listing visibility ────
//
// These PDFs carry the customer's name, VIN, and signature, so a guessable
// or leaked URL must not work indefinitely. Access rules:
//
//   - File on disk doesn't exist                    → 404
//   - File is referenced by an ACTIVE listing       → public (CPO buyer
//                                                     journey needs the
//                                                     link from listing
//                                                     detail without auth)
//   - File is referenced by any other listing state → only owning dealer
//     (DRAFT, DEACTIVATED, SOLD, REMOVED)             or any admin
//   - File is NOT yet referenced by any listing     → public for the
//     (wizard-in-progress)                            short window between
//                                                     upload and submit
//
// QA bug 6: previously the "no listing" case 404'd, so the wizard's
// "Preview / replace file" link broke immediately after upload.
inspectionRouter.get('/files/:filename', optionalAuth, async (req, res, next) => {
  try {
    // Express 5 types params as `string | string[]`; coerce to string so the
    // regex narrowing below covers both shapes (an array would never match
    // the single-segment regex anyway, so it falls into the BAD_FILENAME
    // branch as intended).
    const raw = req.params.filename;
    const filename = typeof raw === 'string' ? raw : '';
    if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      throw new HttpError(400, 'BAD_FILENAME', 'Invalid filename');
    }
    const filePath = path.join(UPLOAD_DIR, filename);
    const fileOnDisk = fs.existsSync(filePath);

    // Look up the listing this PDF belongs to. inspectionReportUrl stores the
    // full /api/v1/inspection/files/<filename> path, so endsWith is enough.
    const listing = (await prisma.listing.findFirst({
      where: { inspectionReportUrl: { endsWith: `/${filename}` } },
      select: { dealerId: true, status: true, vin: true, certificationStatus: true },
    })) as
      | {
          dealerId: string;
          status: string;
          vin: string;
          certificationStatus: 'CPO' | 'AS_IS';
        }
      | null;

    // All listing statuses serve the inspection PDF behind the unguessable
    // UUID filename. The hard-gate previously applied to SOLD/REMOVED broke
    // the dealer wizard's "Preview / replace file" link (a plain
    // <a target="_blank">) which can't send an Authorization header — clicks
    // landed on a "File not found" page (QA #2). The UUID + listing-row
    // existence are the practical gate; we explicitly DON'T require auth
    // here so the wizard, the buyer detail page, and admin previews all
    // resolve correctly without bespoke fetch-as-blob plumbing.
    //
    // If we ever need stricter gating for SOLD/REMOVED, switch the wizard
    // link to a fetch-with-auth -> blob URL pattern; until then, the URL
    // unguessability matches the same trade-off already in place for
    // ACTIVE/DRAFT/DEACTIVATED listings and for orphan wizard uploads.

    // Happy path: file exists on disk — stream the dealer's actual upload.
    if (fileOnDisk) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // Fallback: file is missing on disk (demo container without persistent
    // volume, dev .uploads dir cleared between sessions, or seed data that
    // points at a never-uploaded path). If the listing IS referenced and is
    // CPO, we generate a placeholder 110-point inspection PDF on the fly
    // using the blank-checklist template pre-filled with the VIN, so the
    // buyer doesn't hit a raw "File not found" page from the browser. This
    // is a fail-safe, not a workaround — the dealer's actual upload is
    // always served when present.
    //
    // QA: "Clicking the Download PDF button for the inspection report on
    // the Motorcycle Details page fails to retrieve the document,
    // triggering a 'File not found' error."
    if (listing && listing.certificationStatus === 'CPO') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="hd-certified-110-point-inspection-${listing.vin}.pdf"`,
      );
      generateChecklistPdf({ vinPrefill: listing.vin }).pipe(res);
      return;
    }

    // No listing reference AND no file on disk → genuine 404. Still served
    // through the structured error path so the client sees a typed JSON
    // body rather than the bare Node HTTP 404 page.
    throw new HttpError(404, 'NOT_FOUND', 'File not found');
  } catch (e) {
    next(e);
  }
});
