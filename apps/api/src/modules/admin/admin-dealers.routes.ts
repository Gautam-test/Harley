import { Router } from 'express';
import { z } from 'zod';
import {
  adminCreateDealerInput,
  adminUpdateDealerInput,
  dealerStatus,
  type DealerStatus,
} from '@hd-cpo/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  adminCreateDealer,
  adminListDealers,
  adminResetDealerPassword,
  adminSetDealerStatus,
  adminUpdateDealer,
} from './admin-dealers.service.js';

export const adminDealersRouter = Router();
adminDealersRouter.use(requireAuth(['ADMIN']));

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({ status: dealerStatus.optional(), q: z.string().optional() });
const statusBody = z.object({ status: dealerStatus });

const ctxOf = (req: import('express').Request) => ({
  actorId: req.auth!.sub,
  ip: req.ip,
  ua: req.get('user-agent') ?? undefined,
});

adminDealersRouter.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as { status?: DealerStatus; q?: string };
    res.json(await adminListDealers(q));
  } catch (e) {
    next(e);
  }
});

adminDealersRouter.post('/', validate(adminCreateDealerInput), async (req, res, next) => {
  try {
    res.status(201).json(await adminCreateDealer(req.body, ctxOf(req)));
  } catch (e) {
    next(e);
  }
});

adminDealersRouter.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(adminUpdateDealerInput),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      res.json(await adminUpdateDealer(id, req.body, ctxOf(req)));
    } catch (e) {
      next(e);
    }
  },
);

adminDealersRouter.patch(
  '/:id/status',
  validate(idParam, 'params'),
  validate(statusBody),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { status } = req.body as { status: DealerStatus };
      res.json(await adminSetDealerStatus(id, status, ctxOf(req)));
    } catch (e) {
      next(e);
    }
  },
);

adminDealersRouter.post('/:id/reset-password', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    res.json(await adminResetDealerPassword(id, ctxOf(req)));
  } catch (e) {
    next(e);
  }
});
