import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { generateChecklistPdf } from './checklist-pdf.js';

// ─── Local file storage for uploaded inspection PDFs ────────────────
// In production this is replaced with S3/MinIO + presigned URLs.
const UPLOAD_DIR = path.resolve(process.cwd(), '.uploads', 'inspections');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      // Random filename keeps real customer names out of URLs.
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per PRD §6.2.3 AC4
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (!ok) return cb(new HttpError(415, 'BAD_FILE_TYPE', 'Inspection upload must be a PDF') as Error);
    cb(null, true);
  },
});

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
  (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, 'FILE_MISSING', 'Attach a PDF as form field "file"');
      const url = `/api/v1/inspection/files/${req.file.filename}`;
      res.status(201).json({
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        url,
      });
    } catch (e) {
      next(e);
    }
  },
);

// ─── 3. Public serve of uploaded files (URL is unguessable random UUID) ─
inspectionRouter.get('/files/:filename', (req, res, next) => {
  try {
    const filename = req.params.filename ?? '';
    // Prevent path traversal — only allow simple uuid+ext basenames.
    if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      throw new HttpError(400, 'BAD_FILENAME', 'Invalid filename');
    }
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, 'NOT_FOUND', 'File not found');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    next(e);
  }
});
