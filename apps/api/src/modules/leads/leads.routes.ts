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
import { decryptPii } from '../../utils/crypto.js';
import { prisma } from '../../config/prisma.js';
import {
  checkTradeInVinGate,
  createBuyerEnquiry,
  createTradeInLead,
  dealerCreateBuyerEnquiry,
  dealerCreateTradeInLead,
  getLeadDetail,
  listBuyerEnquiries,
  listTradeInLeads,
  updateLeadStatus,
  updateTradeInAccessories,
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


// QA: pre-flight duplicate gate for the Sell Your Motorcycle form. Lets
// the customer-portal SellBikeModal block the seller BEFORE we fire an
// OTP/SMS (the actual create endpoint below also enforces the gate
// post-OTP, so spoofing this check by bypassing the frontend gains the
// seller nothing). The same VIN rules used at create-time are enforced
// here: any open (non-terminal) trade-in lead for this VIN, or a closed
// lead whose VIN is still listed on the platform, blocks a fresh submit.
publicLeadsRouter.get(
  '/trade-in/vin-status',
  validate(
    z.object({ vin: z.string().min(6).max(20) }),
    'query',
  ),
  async (req, res, next) => {
    try {
      const { vin } = req.query as { vin: string };
      const block = await checkTradeInVinGate(vin);
      if (!block) {
        res.json({ blocked: false });
        return;
      }
      const message =
        block === 'OPEN_LEAD'
          ? 'An enquiry for this bike is already in progress. The dealer will be in touch — you can submit a fresh enquiry once they close this one.'
          : 'This bike already has a closed enquiry and is still listed on the platform. A new enquiry can only be raised once the bike is marked Sold or Removed.';
      res.json({ blocked: true, reason: block, message });
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

// "Have I already enquired about this listing?" — used by the buyer detail
// page to decide whether to show the "Buyer enquiry form already submitted"
// popup when a returning verified buyer clicks Visit Dealer. The check is
// scoped to one listing's enquiries (typically a handful of rows), so the
// per-row decryptPii call to match against the supplied phone is cheap.
// Phones are stored AES-GCM with a per-record random IV, so we can't query
// by ciphertext directly. Only non-terminal leads count — once the dealer
// flips the lead to DEAD ("Not Interested") the buyer is free to enquire
// again.
publicLeadsRouter.get(
  '/listings/:slug/my-status',
  validate(z.object({ slug: z.string().min(1) }), 'params'),
  validate(
    z.object({ phone: z.string().regex(/^\+91[0-9]{10}$/, 'phone must be +91 + 10 digits') }),
    'query',
  ),
  async (req, res, next) => {
    try {
      const { slug } = req.params as { slug: string };
      const { phone } = req.query as { phone: string };
      const listing = await prisma.listing.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!listing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
      const rows = await prisma.enquiry.findMany({
        where: {
          listingId: listing.id,
          // A lead is "open" only while it is still active in the pipeline.
          // Once the dealer moves it to any terminal status the buyer is
          // free to enquire again. Must match TERMINAL_LEAD_STATUSES in
          // leads.service.ts — both lists must stay in sync.
          status: { notIn: ['DEAD', 'LOST', 'DROPPED', 'CLOSED', 'SUCCESS', 'CONVERTED', 'TRADE_IN_FINALIZED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, phoneEnc: true },
      });
      const mine = rows.find((r) => {
        try {
          return decryptPii(r.phoneEnc) === phone;
        } catch {
          return false;
        }
      });
      res.json(
        mine
          ? { enquired: true, leadId: mine.id, status: mine.status }
          : { enquired: false },
      );
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

// Activity timeline for a lead — every pipeline status change + the
// implicit "Lead Created" anchor at the row's createdAt. Backed by the
// AuditLog table (already indexed on entityType + entityId). Dealer-scoped
// so a dealer can never read another dealer's lead history.
dealerLeadsRouter.get(
  '/:kind/:id/activity',
  validate(z.object({ kind: z.enum(['buyer', 'trade-in']), id: z.string().min(1) }), 'params'),
  async (req, res, next) => {
    try {
      const { kind, id } = req.params as { kind: 'buyer' | 'trade-in'; id: string };
      // Dealer-scope check: confirm the lead belongs to this dealer before
      // returning any activity rows.
      const { prisma } = await import('../../config/prisma.js');
      const owns =
        kind === 'buyer'
          ? await prisma.enquiry.findFirst({
              where: { id, dealerId: req.auth!.sub },
              select: { id: true, createdAt: true },
            })
          : await prisma.tradeInLead.findFirst({
              where: { id, dealerId: req.auth!.sub },
              select: { id: true, createdAt: true },
            });
      if (!owns) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');

      const entityType = kind === 'buyer' ? 'Enquiry' : 'TradeInLead';
      const rows = await prisma.auditLog.findMany({
        where: { entityType, entityId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          actorRole: true,
          action: true,
          metadata: true,
          createdAt: true,
        },
      });
      // Synthesise a Lead Created anchor at the row's createdAt timestamp
      // so the timeline always has a starting point, including for buyer
      // OTP-flow enquiries that skipped the LEAD_CREATED_MANUAL audit row.
      const hasCreated = rows.some((r) => r.action.startsWith('LEAD_CREATED'));
      const items = (
        hasCreated
          ? rows
          : [
              {
                id: `synthetic-created-${id}`,
                actorRole: 'SYSTEM' as const,
                action: 'LEAD_CREATED',
                metadata: null,
                createdAt: owns.createdAt,
              },
              ...rows,
            ]
      ).map((r) => ({
        id: r.id,
        actorRole: r.actorRole,
        action: r.action,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt.toISOString(),
      }));
      res.json(items);
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
      // Audit every pipeline move so admins (via /audit) and dealers (via
      // the activity timeline on the lead detail page) can reconstruct
      // exactly when a lead changed state, who did it, and what the prior
      // status was. No-op moves (current === target) skip the audit row.
      if (updated.changed) {
        void audit({
          actorId: req.auth!.sub,
          actorRole: 'DEALER',
          action: 'LEAD_STATUS_CHANGED',
          entityType: kind === 'buyer' ? 'Enquiry' : 'TradeInLead',
          entityId: id,
          metadata: {
            from: updated.fromStatus,
            to: updated.toStatus,
            kind,
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
        }).catch(() => {
          /* swallow audit failure */
        });
      }
      res.json({ id, status: updated.toStatus });
    } catch (e) {
      next(e);
    }
  },
);

// Dealer records accessories installed on a seller's trade-in motorcycle.
// Stored in notes JSON so no schema migration is needed. Optional field —
// dealers can skip or clear it at any time.
dealerLeadsRouter.patch(
  '/trade-in/:id/accessories',
  validate(z.object({ id: z.string().min(1) }), 'params'),
  validate(z.object({
    accessoriesInstalled: z.boolean(),
    accessories: z.array(z.string().min(1).max(200)).max(50),
  })),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const { accessoriesInstalled, accessories } = req.body as {
        accessoriesInstalled: boolean;
        accessories: string[];
      };
      const result = await updateTradeInAccessories(
        req.auth!.sub,
        id,
        accessoriesInstalled,
        accessories,
      );
      res.json(result);
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
