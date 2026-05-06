import { Router, type Request } from 'express';
import { z } from 'zod';
import { createListingInput, updateListingInput, listingStatus } from '@hd-cpo/types';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../audit/audit.service.js';
import {
  createListing,
  listForDealer,
  markSold,
  setActiveToggle,
  softRemove,
  updateListing,
} from './dealer-listings.service.js';

export const dealerListingsRouter = Router();
dealerListingsRouter.use(requireAuth(['DEALER']));

const listQuery = z.object({ status: listingStatus.optional() });
const idParam = z.object({ id: z.string().min(1) });

// Helper — every mutating dealer route logs an audit row so admin governance
// can trace every state change a dealer makes (creates, edits, sold, turn-off
// etc.). Logs are best-effort: a logging failure never blocks the mutation.
function logDealer(
  req: Request,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  return audit({
    actorId: req.auth!.sub,
    actorRole: 'DEALER',
    action,
    entityType: 'Listing',
    entityId,
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  }).catch(() => {
    /* swallow — audit failures shouldn't break user-facing flows */
  });
}

dealerListingsRouter.get('/', validate(listQuery, 'query'), async (req, res, next) => {
  try {
    res.json(await listForDealer(req.auth!.sub, (req.query as { status?: string }).status));
  } catch (e) {
    next(e);
  }
});

dealerListingsRouter.post('/', validate(createListingInput), async (req, res, next) => {
  try {
    const listing = await createListing(req.auth!.sub, req.body);
    void logDealer(req, 'LISTING_CREATED', listing.id, {
      vin: listing.vin,
      certificationStatus: listing.certificationStatus,
    });
    res.status(201).json({ id: listing.id, slug: listing.slug, status: listing.status });
  } catch (e) {
    next(e);
  }
});

dealerListingsRouter.patch(
  '/:id',
  validate(idParam, 'params'),
  validate(updateListingInput),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const updated = await updateListing(req.auth!.sub, id, req.body);
      void logDealer(req, 'LISTING_UPDATED', id, {
        fields: Object.keys(req.body as Record<string, unknown>),
      });
      res.json({ id: updated.id });
    } catch (e) {
      next(e);
    }
  },
);

// NOTE: Dealer-side publish has been removed by design — only an admin can move
// a DRAFT listing to ACTIVE. Dealers create drafts; admins gate-keep visibility.

dealerListingsRouter.post(
  '/:id/mark-sold',
  validate(idParam, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const updated = await markSold(req.auth!.sub, id);
      void logDealer(req, 'LISTING_MARKED_SOLD', id, { soldAt: updated.soldAt });
      res.json({ id: updated.id, status: updated.status, soldAt: updated.soldAt });
    } catch (e) {
      next(e);
    }
  },
);

dealerListingsRouter.post(
  '/:id/turn-off',
  validate(idParam, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const updated = await setActiveToggle(req.auth!.sub, id, false);
      void logDealer(req, 'LISTING_TURNED_OFF', id);
      res.json({ id: updated.id, status: updated.status });
    } catch (e) {
      next(e);
    }
  },
);

dealerListingsRouter.post(
  '/:id/turn-on',
  validate(idParam, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as { id: string };
      const updated = await setActiveToggle(req.auth!.sub, id, true);
      void logDealer(req, 'LISTING_TURNED_ON', id);
      res.json({ id: updated.id, status: updated.status });
    } catch (e) {
      next(e);
    }
  },
);

dealerListingsRouter.delete('/:id', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const updated = await softRemove(req.auth!.sub, id);
    void logDealer(req, 'LISTING_REMOVED_BY_DEALER', id);
    res.json({ id: updated.id, status: updated.status });
  } catch (e) {
    next(e);
  }
});
