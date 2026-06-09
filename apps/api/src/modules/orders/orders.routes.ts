import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import {
  ORDER_PIPELINE,
  advanceOrderStatus,
  createOrder,
  listDealerOrders,
  type OrderStatus,
} from './orders.service.js';

export const publicOrdersRouter = Router();
export const dealerOrdersRouter = Router();

// ─── PUBLIC — Track Your Harley ─────────────────────────────────────────
//
// BUG-061: public /orders/track/:orderId endpoint removed alongside
// the buyer-facing Track Your Enquiry feature. Dealers still see their
// own orders via the authenticated routes below. The trackOrder
// service function is left in place for now in case admin tooling
// needs it later — it's just no longer publicly exposed.

// ─── DEALER — manage own orders ─────────────────────────────────────────

dealerOrdersRouter.use(requireAuth(['DEALER']));

dealerOrdersRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listDealerOrders(req.auth!.sub));
  } catch (e) {
    next(e);
  }
});

const createOrderBody = z.object({
  orderId: z.string().min(4).max(64),
  buyerName: z.string().min(2).max(120),
  buyerPhone: z.string().min(8).max(20),
  buyerEmail: z.string().email(),
  bikeLabel: z.string().min(2).max(160),
  listingId: z.string().min(1).optional(),
  estimatedDelivery: z.string().datetime().optional(),
});

dealerOrdersRouter.post('/', validate(createOrderBody), async (req, res, next) => {
  try {
    const out = await createOrder(req.auth!.sub, req.body);
    res.status(201).json({ id: out.id, orderId: out.orderId });
  } catch (e) {
    next(e);
  }
});

const orderStatusBody = z.object({
  status: z.enum(ORDER_PIPELINE as unknown as [OrderStatus, ...OrderStatus[]]),
  note: z.string().max(500).optional(),
});

dealerOrdersRouter.patch(
  '/:id/status',
  validate(z.object({ id: z.string().min(1) }), 'params'),
  validate(orderStatusBody),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { status, note } = req.body as { status: OrderStatus; note?: string };
      const updated = await advanceOrderStatus(req.auth!.sub, id, status, note);
      res.json({ id: updated.id, status: updated.status });
    } catch (e) {
      next(e);
    }
  },
);
