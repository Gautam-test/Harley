import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';

export const dealerLeadCommentsRouter = Router();

dealerLeadCommentsRouter.use(requireAuth(['DEALER']));

const kindParam = z.enum(['general', 'buyer', 'trade-in']);
const paramsSchema = z.object({
  kind: kindParam,
  id: z.string().min(1),
});
const bodySchema = z.object({ body: z.string().min(1).max(2000) });

// Verify that the lead identified by (kind, id) belongs to this dealer.
async function ensureLeadOwnedByDealer(
  kind: 'general' | 'buyer' | 'trade-in',
  id: string,
  dealerId: string,
) {
  let dealerOnLead: string | null = null;
  if (kind === 'buyer') {
    const row = await prisma.enquiry.findUnique({ where: { id }, select: { dealerId: true } });
    dealerOnLead = row?.dealerId ?? null;
  } else if (kind === 'general') {
    const row = await prisma.generalLead.findUnique({ where: { id }, select: { dealerId: true } });
    dealerOnLead = row?.dealerId ?? null;
  } else {
    const row = await prisma.tradeInLead.findUnique({ where: { id }, select: { dealerId: true } });
    dealerOnLead = row?.dealerId ?? null;
  }
  if (!dealerOnLead) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
  if (dealerOnLead !== dealerId) throw new HttpError(403, 'FORBIDDEN', 'Not your lead');
}

dealerLeadCommentsRouter.get(
  '/:kind/:id/comments',
  validate(paramsSchema, 'params'),
  async (req, res, next) => {
    try {
      const { kind, id } = req.params as { kind: 'general' | 'buyer' | 'trade-in'; id: string };
      await ensureLeadOwnedByDealer(kind, id, req.auth!.sub);
      const rows = await prisma.leadComment.findMany({
        where: { leadKind: kind, leadId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          body: true,
          authorName: true,
          authorRole: true,
          createdAt: true,
        },
      });
      res.json(rows);
    } catch (e) {
      next(e);
    }
  },
);

dealerLeadCommentsRouter.post(
  '/:kind/:id/comments',
  validate(paramsSchema, 'params'),
  validate(bodySchema),
  async (req, res, next) => {
    try {
      const { kind, id } = req.params as { kind: 'general' | 'buyer' | 'trade-in'; id: string };
      const { body } = req.body as { body: string };
      await ensureLeadOwnedByDealer(kind, id, req.auth!.sub);
      const dealer = await prisma.dealer.findUnique({
        where: { id: req.auth!.sub },
        select: { name: true },
      });
      const comment = await prisma.leadComment.create({
        data: {
          leadKind: kind,
          leadId: id,
          authorId: req.auth!.sub,
          authorRole: 'DEALER',
          authorName: dealer?.name ?? 'Dealer',
          body,
        },
        select: {
          id: true,
          body: true,
          authorName: true,
          authorRole: true,
          createdAt: true,
        },
      });
      res.status(201).json(comment);
    } catch (e) {
      next(e);
    }
  },
);
