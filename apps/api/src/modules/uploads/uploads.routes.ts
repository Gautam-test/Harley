import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { requireAuth } from '../../middleware/auth.js';
import { logger } from '../../config/logger.js';
import { HttpError } from '../../middleware/error-handler.js';

// Generic asset upload handler — first consumer is the listing image picker
// in the dealer wizard. Same multer + UUID + serve pattern as inspection PDFs;
// kept in its own module so other asset types (banners, dealer logos) can hook
// in without bloating the inspection module.
//
// PRD §6.2.3 AC3 — every upload is normalised into TWO derived assets:
//   * `<uuid>.webp`  — full size cap 1600×1200, used on listing detail
//   * `<uuid>-thumb.webp` — thumbnail cap 400×300, used in card grids
// The original is discarded after processing — saves disk and stops the
// "8 MB raw upload" LCP regression. Both files are served from the same
// /listing-images/<filename> route; the FE picks the suffix it needs.
const UPLOAD_ROOT = path.resolve(process.cwd(), '.uploads');
const LISTING_IMAGE_DIR = path.join(UPLOAD_ROOT, 'listing-images');
fs.mkdirSync(LISTING_IMAGE_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Memory storage — Sharp pipes from buffer, so no temp file needed.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB cap on source uploads
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ALLOWED_IMAGE_MIME.has(file.mimetype) || ALLOWED_IMAGE_EXT.has(ext);
    if (!ok) {
      return cb(new HttpError(415, 'BAD_FILE_TYPE', 'Image must be JPG, PNG, or WebP') as Error);
    }
    cb(null, true);
  },
});

export const uploadsRouter = Router();

// Single-file POST — wizard step 3 fires one of these per dropped file so it
// can show per-file progress and per-file failures. Up to 8 images per listing.
uploadsRouter.post(
  '/listing-image',
  requireAuth(['DEALER']),
  imageUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) throw new HttpError(400, 'FILE_MISSING', 'Attach an image as form field "file"');

      const id = randomUUID();
      const fullPath = path.join(LISTING_IMAGE_DIR, `${id}.webp`);
      const thumbPath = path.join(LISTING_IMAGE_DIR, `${id}-thumb.webp`);

      // Resize + re-encode pipeline. WebP is universally supported by current
      // browsers (≥95% per caniuse) and gives ~30% smaller files than JPEG at
      // visually-equivalent quality. Quality 82 is the sweet-spot for photos.
      const baseInput = sharp(req.file.buffer, { failOn: 'truncated' }).rotate(); // honour EXIF orientation

      const [fullMeta, thumbMeta] = await Promise.all([
        baseInput
          .clone()
          .resize({ width: 1600, height: 1200, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toFile(fullPath),
        baseInput
          .clone()
          .resize({ width: 400, height: 300, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 78, effort: 4 })
          .toFile(thumbPath),
      ]);

      const url = `/api/v1/uploads/listing-images/${id}.webp`;
      const thumbUrl = `/api/v1/uploads/listing-images/${id}-thumb.webp`;

      logger.info(
        {
          id,
          originalName: req.file.originalname,
          originalBytes: req.file.size,
          fullBytes: fullMeta.size,
          thumbBytes: thumbMeta.size,
          fullDims: `${fullMeta.width}x${fullMeta.height}`,
        },
        'listing image processed',
      );

      res.status(201).json({
        filename: `${id}.webp`,
        thumbFilename: `${id}-thumb.webp`,
        originalName: req.file.originalname,
        size: fullMeta.size,
        thumbSize: thumbMeta.size,
        width: fullMeta.width,
        height: fullMeta.height,
        url,
        thumbUrl,
      });
    } catch (e) {
      // Sharp throws on malformed images — surface a 400 rather than a generic 500.
      if (e instanceof Error && /input.*image|VipsImage|unsupported image/i.test(e.message)) {
        return next(new HttpError(400, 'BAD_IMAGE', 'Could not process this image — try a fresh JPG or PNG'));
      }
      next(e);
    }
  },
);

// Public serve. Filename is an unguessable UUID + ext; reject anything else
// to block path traversal.
uploadsRouter.get('/listing-images/:filename', (req, res, next) => {
  try {
    const filename = req.params.filename ?? '';
    // Allow alphanumerics + hyphen for `<uuid>` and `<uuid>-thumb`; single
    // extension at end. Two consecutive dots / slashes are blocked.
    if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      throw new HttpError(400, 'BAD_FILENAME', 'Invalid filename');
    }
    const filePath = path.join(LISTING_IMAGE_DIR, filename);
    if (!fs.existsSync(filePath)) throw new HttpError(404, 'NOT_FOUND', 'File not found');
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' :
      'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    next(e);
  }
});

// Best-effort delete — fired when the wizard replaces an image so we don't
// leak the prior file. Dealer-auth gated; safe to no-op on missing files.
// Deletes both the full and thumb derivatives in one call.
uploadsRouter.delete(
  '/listing-images/:filename',
  requireAuth(['DEALER']),
  async (req, res, next) => {
    try {
      const raw = req.params.filename;
      const filename = typeof raw === 'string' ? raw : '';
      if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(filename)) {
        throw new HttpError(400, 'BAD_FILENAME', 'Invalid filename');
      }
      // Strip "-thumb" if the caller passed a thumb URL, then delete both.
      const baseId = filename.replace(/-thumb\.webp$/, '.webp').replace(/\.webp$/, '');
      const targets = [
        path.join(LISTING_IMAGE_DIR, `${baseId}.webp`),
        path.join(LISTING_IMAGE_DIR, `${baseId}-thumb.webp`),
        path.join(LISTING_IMAGE_DIR, filename), // legacy non-webp uploads
      ];
      await Promise.all(
        targets.map((p) =>
          fsp.unlink(p).catch((err) => {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
          }),
        ),
      );
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);
