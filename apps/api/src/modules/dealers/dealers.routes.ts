import { Router } from 'express';
import { nearestDealersQuery } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { validate } from '../../middleware/validate.js';

interface DealerLocatorRow {
  id: string;
  name: string;
  city: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

export const dealersRouter = Router();

// Public dealer locator (PRD §6.1.1). Returns dealers with masked contact info.
dealersRouter.get('/', validate(nearestDealersQuery, 'query'), async (req, res, next) => {
  try {
    const dealers = (await prisma.dealer.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        city: true,
        pincode: true,
        latitude: true,
        longitude: true,
      },
      take: 50,
    })) as unknown as DealerLocatorRow[];
    res.json(dealers);
  } catch (e) {
    next(e);
  }
});
