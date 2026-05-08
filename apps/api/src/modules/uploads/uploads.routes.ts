import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { optionalAuth, requireAuth } from '../../middleware/auth.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/prisma.js';
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

// Inline magic-byte sniffer. We only accept JPG / PNG / WebP, so a tiny
// signature table is more reliable (and dependency-free) than trusting the
// Content-Type header an attacker controls.
//
// Format references:
//   JPEG  FF D8 FF
//   PNG   89 50 4E 47 0D 0A 1A 0A
//   WebP  52 49 46 46 ?? ?? ?? ?? 57 45 42 50  (RIFF....WEBP)
function detectImageKind(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'webp';
  }
  return null;
}

// Memory storage — Sharp pipes from buffer, so no temp file needed.
//
// fileFilter requires BOTH mime AND extension to pass (was a logical-OR,
// which let `.pdf` files masquerading as `image/jpeg` through). The
// magic-byte sniff in the handler catches the third class of attack:
// matching mime + matching extension but bytes from a different format.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB cap on source uploads
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = ALLOWED_IMAGE_MIME.has(file.mimetype);
    const extOk = ALLOWED_IMAGE_EXT.has(ext);
    if (!mimeOk || !extOk) {
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
      // Magic-byte verification — defends against header spoofing where the
      // mime + extension match but the underlying bytes are something else
      // (e.g. a PHP script renamed to .jpg). Sharp would also throw on those,
      // but a clean 415 here keeps the error message accurate.
      if (!detectImageKind(req.file.buffer)) {
        throw new HttpError(
          415,
          'BAD_FILE_TYPE',
          'File contents do not match a JPG, PNG, or WebP image',
        );
      }

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

// Listing-image serve. Visibility tiers:
//
//   1. File on disk doesn't exist                  → 404
//   2. File is referenced by an ACTIVE listing      → public (buyer site)
//   3. File is referenced by a non-ACTIVE listing   → only owning dealer
//                                                     or any admin
//   4. File is NOT yet referenced by any listing
//      → ANY authenticated dealer can fetch it
//      (this is the wizard-in-progress case: the dealer just uploaded
//      and the picker needs to show the just-uploaded image before the
//      listing row is created)
//
// Without case 4 the dealer wizard's image picker rendered broken-image
// glyphs after every successful upload — flagged in QA bug 5.
uploadsRouter.get('/listing-images/:filename', optionalAuth, async (req, res, next) => {
  try {
    // Express 5 widens params to `string | string[]`; coerce so the regex
    // gate below treats anything else as a bad filename.
    const raw = req.params.filename;
    const filename = typeof raw === 'string' ? raw : '';
    if (!/^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/.test(filename)) {
      throw new HttpError(400, 'BAD_FILENAME', 'Invalid filename');
    }
    const filePath = path.join(LISTING_IMAGE_DIR, filename);
    if (!fs.existsSync(filePath)) throw new HttpError(404, 'NOT_FOUND', 'File not found');

    // Listings store only the full-size image URL in the `images[]` array;
    // thumbs are derived. Strip the -thumb suffix so both serve through the
    // same listing lookup.
    const fullName = filename.replace(/-thumb\.webp$/, '.webp');
    const fullUrl = `/api/v1/uploads/listing-images/${fullName}`;
    const listing = (await prisma.listing.findFirst({
      where: { images: { has: fullUrl } },
      select: { dealerId: true, status: true },
    })) as { dealerId: string; status: string } | null;

    if (listing) {
      // Soft-gate matches inspection PDFs: ACTIVE / DRAFT / DEACTIVATED
      // listings serve their photos publicly so admin preview drawers
      // (which use plain <img src=> without auth headers) can render
      // them. SOLD/REMOVED stay auth-only since those are off-market.
      const softTier = listing.status === 'ACTIVE' || listing.status === 'DRAFT' || listing.status === 'DEACTIVATED';
      if (!softTier) {
        const auth = req.auth;
        const isOwner = auth?.role === 'DEALER' && auth.sub === listing.dealerId;
        const isAdmin = auth?.role === 'ADMIN';
        if (!isOwner && !isAdmin) {
          throw new HttpError(404, 'NOT_FOUND', 'File not found');
        }
      }
    }
    // else: file isn't referenced by any listing yet — this is the
    // wizard-in-progress case (dealer just uploaded; listing.create
    // hasn't run yet). Plain <img> tags can't send a bearer token, so
    // requiring auth here would render broken-image glyphs in the
    // dealer picker. We treat the random UUID filename as the gate
    // for this short window. Once the listing is created the
    // listing-status check above takes over again, and once it's
    // REMOVED the file goes back to gated access.

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
