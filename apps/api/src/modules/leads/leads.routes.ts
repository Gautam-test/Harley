import { Router } from 'express';
import { z } from 'zod';
import {
  enquiryInput,
  dealerBuyerEnquiryInput,
  dealerTradeInLeadInput,
  tradeInLeadInput,
  leadStatus,
  type LeadStatus,
} from '@hd-cpo/types';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { HttpError } from '../../middleware/error-handler.js';
import { audit } from '../audit/audit.service.js';
import { consumeVerifiedToken } from '../otp/otp.service.js';
import {
  createBuyerEnquiry,
  createTradeInLead,
  dealerCreateBuyerEnquiry,
  dealerCreateTradeInLead,
  getLeadDetail,
  listBuyerEnquiries,
  listTradeInLeads,
  updateLeadStatus,
} from './leads.service.js';
import { trackLead } from './leads.track.js';

export const publicLeadsRouter = Router();
export const dealerLeadsRouter = Router();

// PRD §6.1.4 — Authorization: Bearer <verifiedToken> guards lead-creation endpoints.
function requireVerifiedToken(purpose: 'ENQUIRY' | 'TRADE_IN') {
  return (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return next(new HttpError(401, 'OTP_REQUIRED', 'Verify your phone via OTP first'));
    }
    try {
      consumeVerifiedToken(header.slice(7), purpose);
      next();
    } catch (e) {
      next(e);
    }
  };
}

// ─── PUBLIC ─────────────────────────────────────────────────────────────

// Lead tracker — anyone with a valid enquiry CUID can check status.
publicLeadsRouter.get(
  '/track/:id',
  validate(z.object({ id: z.string().min(6).max(64) }), 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      res.json(await trackLead({ id }));
    } catch (e) {
      next(e);
    }
  },
);


publicLeadsRouter.post(
  '/trade-in',
  requireVerifiedToken('TRADE_IN'),
  validate(tradeInLeadInput),
  async (req, res, next) => {
    try {
      const out = await createTradeInLead(req.body);
      res.status(201).json(out);
    } catch (e) {
      next(e);
    }
  },
);

publicLeadsRouter.post(
  '/listings/:slug/enquiry',
  requireVerifiedToken('ENQUIRY'),
  validate(z.object({ slug: z.string().min(1) }), 'params'),
  validate(enquiryInput),
  async (req, res, next) => {
    try {
      const { slug } = req.params as { slug: string };
      const out = await createBuyerEnquiry(slug, req.body);
      res.status(201).json(out);
    } catch (e) {
      next(e);
    }
  },
);

// ─── DEALER QUEUES (auth-gated) ─────────────────────────────────────────

dealerLeadsRouter.use(requireAuth(['DEALER']));

const statusQuery = z.object({ status: leadStatus.optional() });
const idParam = z.object({ id: z.string().min(1) });
const statusBody = z.object({ status: leadStatus });

dealerLeadsRouter.get('/buyer', validate(statusQuery, 'query'), async (req, res, next) => {
  try {
    res.json(await listBuyerEnquiries(req.auth!.sub, (req.query as { status?: LeadStatus }).status));
  } catch (e) {
    next(e);
  }
});

dealerLeadsRouter.get('/trade-in', validate(statusQuery, 'query'), async (req, res, next) => {
  try {
    res.json(await listTradeInLeads(req.auth!.sub, (req.query as { status?: LeadStatus }).status));
  } catch (e) {
    next(e);
  }
});

dealerLeadsRouter.get(
  '/:kind/:id/detail',
  validate(
    z.object({ kind: z.enum(['buyer', 'trade-in']), id: z.string().min(1) }),
    'params',
  ),
  async (req, res, next) => {
    try {
      const { kind, id } = req.params as { kind: 'buyer' | 'trade-in'; id: string };
      res.json(await getLeadDetail(req.auth!.sub, kind, id));
    } catch (e) {
      next(e);
    }
  },
);

dealerLeadsRouter.patch(
  '/:kind/:id/status',
  validate(z.object({ kind: z.enum(['buyer', 'trade-in']), id: z.string().min(1) }), 'params'),
  validate(statusBody),
  async (req, res, next) => {
    try {
      const { kind, id } = req.params as { kind: 'buyer' | 'trade-in'; id: string };
      const { status } = req.body as { status: LeadStatus };
      const updated = await updateLeadStatus(req.auth!.sub, kind, id, status);
      // Audit every pipeline move so admins (via /audit) can reconstruct
      // exactly when a lead changed state and which dealer did it.
      void audit({
        actorId: req.auth!.sub,
        actorRole: 'DEALER',
        action: 'LEAD_STATUS_CHANGED',
        entityType: kind === 'buyer' ? 'Enquiry' : 'TradeInLead',
        entityId: id,
        metadata: { newStatus: status, kind },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }).catch(() => {
        /* swallow audit failure */
      });
      res.json({ id: updated.id, status: updated.status });
    } catch (e) {
      next(e);
    }
  },
);

// ─── Dealer-side manual lead creation ─────────────────────────────────────
// Two POST endpoints that let a dealer rep log a phone-call / walk-in lead
// without going through the buyer-facing OTP gate. Audited so admins can see
// who created what.

dealerLeadsRouter.post(
  '/buyer',
  validate(dealerBuyerEnquiryInput),
  async (req, res, next) => {
    try {
      const out = await dealerCreateBuyerEnquiry(req.auth!.sub, req.body);
      void audit({
        actorId: req.auth!.sub,
        actorRole: 'DEALER',
        action: 'LEAD_CREATED_MANUAL',
        entityType: 'Enquiry',
        entityId: out.id,
        metadata: { listingId: req.body.listingId, kind: 'buyer' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }).catch(() => {
        /* swallow audit failure */
      });
      res.status(201).json(out);
    } catch (e) {
      next(e);
    }
  },
);

dealerLeadsRouter.post(
  '/trade-in',
  validate(dealerTradeInLeadInput),
  async (req, res, next) => {
    try {
      const out = await dealerCreateTradeInLead(req.auth!.sub, req.body);
      void audit({
        actorId: req.auth!.sub,
        actorRole: 'DEALER',
        action: 'LEAD_CREATED_MANUAL',
        entityType: 'TradeInLead',
        entityId: out.id,
        metadata: { vin: req.body.vin, kind: 'trade-in' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      }).catch(() => {
        /* swallow audit failure */
      });
      res.status(201).json(out);
    } catch (e) {
      next(e);
    }
  },
);
