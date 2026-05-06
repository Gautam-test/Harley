import { Router } from 'express';
import { z } from 'zod';
import { vin } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { torque } from './torque.module.js';

export const torqueRouter = Router();

const vinParam = z.object({ vin });

// Dealer-only — preview a vehicle before committing to a listing.
//
// PRD §6.2.3 AC1 — VIN must exist in Torque AND be assigned to this dealer.
// We do BOTH checks here (rather than waiting for listing-create) so the
// dealer gets immediate feedback in Step 1 of the wizard instead of filling
// the entire form only to be blocked at submit.
torqueRouter.get(
  '/vehicles/:vin',
  requireAuth(['DEALER']),
  validate(vinParam, 'params'),
  async (req, res, next) => {
    try {
      const { vin: requestedVin } = req.params as { vin: string };
      const vehicle = await torque.getVehicleByVin(requestedVin);
      if (!vehicle) throw new HttpError(404, 'TORQUE_VIN_NOT_FOUND', 'VIN not found in Torque');

      // Look up the requesting dealer so we can compare torqueDealerId.
      const dealer = await prisma.dealer.findUnique({
        where: { id: req.auth!.sub },
        select: { torqueDealerId: true },
      });
      if (
        dealer?.torqueDealerId &&
        vehicle.dealerId !== dealer.torqueDealerId
      ) {
        throw new HttpError(
          403,
          'VIN_NOT_ASSIGNED',
          `Torque shows this VIN is registered to ${vehicle.dealerId}, not your dealership (${dealer.torqueDealerId}). Ask your H-D admin to update the assignment in Torque, or pick a VIN from your own inventory.`,
        );
      }

      res.json(vehicle);
    } catch (e) {
      next(e);
    }
  },
);

torqueRouter.get(
  '/vehicles/:vin/cpo-kit',
  requireAuth(['DEALER']),
  validate(vinParam, 'params'),
  async (req, res, next) => {
    try {
      const { vin: requestedVin } = req.params as { vin: string };
      res.json(await torque.getCpoKit(requestedVin));
    } catch (e) {
      next(e);
    }
  },
);
