import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { adminCreateDealerInput } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/error-handler.js';
import { audit } from '../audit/audit.service.js';

// PRD §6.3.3 — Bulk import via Excel (.xlsx).
// Columns: username, password (or auto-generated), name, legalName, email, phone,
// address, city, state, pincode, torqueDealerId.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (!ok) return cb(new HttpError(415, 'BAD_FILE_TYPE', 'Upload must be .xlsx') as Error);
    cb(null, true);
  },
});

export const adminBulkImportRouter = Router();
adminBulkImportRouter.use(requireAuth(['ADMIN']));

interface ImportRow {
  username?: string;
  password?: string;
  name?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  torqueDealerId?: string;
}

interface ImportResult {
  rowNumber: number;
  username?: string;
  status: 'created' | 'skipped' | 'error';
  generatedPassword?: string;
  error?: string;
}

adminBulkImportRouter.post('/dealers', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, 'FILE_MISSING', 'Upload .xlsx as form field "file"');

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) throw new HttpError(400, 'EMPTY_WORKBOOK', 'No sheets found');
    const sheet = wb.Sheets[firstSheetName];
    if (!sheet) throw new HttpError(400, 'EMPTY_WORKBOOK', 'No sheet contents');
    const rows = XLSX.utils.sheet_to_json<ImportRow>(sheet, { defval: '' });

    const results: ImportResult[] = [];
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rowNumber = i + 2; // header is row 1

      try {
        const generatedPassword = !r.password ? randomBytes(12).toString('base64url').slice(0, 16) : null;
        const parsed = adminCreateDealerInput.safeParse({
          username: r.username,
          password: r.password || undefined,
          name: r.name,
          legalName: r.legalName || undefined,
          email: r.email,
          phone: r.phone,
          address: r.address || undefined,
          city: r.city,
          state: r.state || undefined,
          pincode: String(r.pincode ?? '').padStart(6, '0'),
          torqueDealerId: r.torqueDealerId || undefined,
        });
        if (!parsed.success) {
          results.push({
            rowNumber,
            username: r.username,
            status: 'error',
            error: Object.values(parsed.error.flatten().fieldErrors).flat().join('; '),
          });
          continue;
        }

        const existing = await prisma.dealer.findUnique({ where: { username: parsed.data.username } });
        if (existing) {
          results.push({ rowNumber, username: parsed.data.username, status: 'skipped' });
          skipped += 1;
          continue;
        }

        const passwordToHash = parsed.data.password ?? generatedPassword!;
        const passwordHash = await bcrypt.hash(passwordToHash, 12);
        const dealer = await prisma.dealer.create({
          data: {
            username: parsed.data.username,
            passwordHash,
            name: parsed.data.name,
            legalName: parsed.data.legalName,
            email: parsed.data.email,
            phone: parsed.data.phone,
            address: parsed.data.address,
            city: parsed.data.city,
            state: parsed.data.state,
            pincode: parsed.data.pincode,
            latitude: parsed.data.latitude,
            longitude: parsed.data.longitude,
            torqueDealerId: parsed.data.torqueDealerId,
          },
        });

        results.push({
          rowNumber,
          username: dealer.username,
          status: 'created',
          generatedPassword: generatedPassword ?? undefined,
        });
        created += 1;
      } catch (e) {
        results.push({
          rowNumber,
          username: r.username,
          status: 'error',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    await audit({
      actorId: req.auth!.sub,
      actorRole: 'ADMIN',
      action: 'DEALER_BULK_IMPORT',
      metadata: { total: rows.length, created, skipped, errors: results.length - created - skipped },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });

    res.json({
      summary: { total: rows.length, created, skipped, errors: results.length - created - skipped },
      results,
    });
  } catch (e) {
    next(e);
  }
});
