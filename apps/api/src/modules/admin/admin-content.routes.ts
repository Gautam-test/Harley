import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';

interface ContentRow {
  id: string;
  key: string;
  title: string;
  bodyHtml: string;
  version: number;
  updatedAt: Date;
}

export const adminContentRouter = Router();
adminContentRouter.use(requireAuth(['ADMIN']));

const keyParam = z.object({ key: z.string().min(1).max(60) });
const upsertBody = z.object({
  title: z.string().min(1).max(200),
  bodyHtml: z.string().min(1).max(200_000),
});

adminContentRouter.get('/', async (_req, res, next) => {
  try {
    const rows = (await prisma.staticContent.findMany({
      orderBy: { key: 'asc' },
    })) as unknown as ContentRow[];
    res.json(rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })));
  } catch (e) {
    next(e);
  }
});

adminContentRouter.get('/:key', validate(keyParam, 'params'), async (req, res, next) => {
  try {
    const { key } = req.params as { key: string };
    const row = (await prisma.staticContent.findUnique({ where: { key } })) as ContentRow | null;
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Content not found' } });
      return;
    }
    res.json({ ...row, updatedAt: row.updatedAt.toISOString() });
  } catch (e) {
    next(e);
  }
});

adminContentRouter.put(
  '/:key',
  validate(keyParam, 'params'),
  validate(upsertBody),
  async (req, res, next) => {
    try {
      const { key } = req.params as { key: string };
      const { title, bodyHtml } = req.body as { title: string; bodyHtml: string };
      const existing = (await prisma.staticContent.findUnique({ where: { key } })) as ContentRow | null;
      const row = await prisma.staticContent.upsert({
        where: { key },
        create: { key, title, bodyHtml, version: 1 },
        update: { title, bodyHtml, version: (existing?.version ?? 0) + 1 },
      });
      await audit({
        actorId: req.auth!.sub,
        actorRole: 'ADMIN',
        action: existing ? 'CONTENT_UPDATED' : 'CONTENT_CREATED',
        entityType: 'StaticContent',
        entityId: row.id,
        metadata: { key, version: row.version },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      res.json({ id: row.id, key: row.key, version: row.version });
    } catch (e) {
      next(e);
    }
  },
);

// Public read endpoint for the buyer site (mounted separately).
export const publicContentRouter = Router();
publicContentRouter.get('/:key', validate(keyParam, 'params'), async (req, res, next) => {
  try {
    const { key } = req.params as { key: string };
    const row = (await prisma.staticContent.findUnique({ where: { key } })) as ContentRow | null;
    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Content not found' } });
      return;
    }
    res.json({ key: row.key, title: row.title, bodyHtml: row.bodyHtml, updatedAt: row.updatedAt.toISOString() });
  } catch (e) {
    next(e);
  }
});
