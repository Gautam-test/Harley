import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';

interface AuditRow {
  id: string;
  actorId: string | null;
  actorRole: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  actor: { name: string } | null;
}

export const adminAuditRouter = Router();
adminAuditRouter.use(requireAuth(['ADMIN']));

const auditQuery = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

adminAuditRouter.get('/', validate(auditQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as z.infer<typeof auditQuery>;
    const where = {
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };

    const rows = (await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      include: { actor: { select: { name: true } } },
    })) as unknown as AuditRow[];

    if (q.format === 'csv') {
      const header = 'id,createdAt,actorRole,actorName,action,entityType,entityId,ip\n';
      const body = rows
        .map((r) =>
          [
            r.id,
            r.createdAt.toISOString(),
            r.actorRole,
            r.actor?.name ?? '',
            r.action,
            r.entityType ?? '',
            r.entityId ?? '',
            r.ipAddress ?? '',
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(','),
        )
        .join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
      res.send(header + body);
      return;
    }

    res.json(
      rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorId: r.actorId,
        actorRole: r.actorRole,
        actorName: r.actor?.name ?? null,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        ipAddress: r.ipAddress,
      })),
    );
  } catch (e) {
    next(e);
  }
});
