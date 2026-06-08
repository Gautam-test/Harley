import { Router } from 'express';
import { nearestDealersQuery } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { validate } from '../../middleware/validate.js';

interface DealerLocatorRow {
  id: string;
  name: string;
  city: string;
  pincode: string;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export const dealersRouter = Router();

// Haversine distance in km between two lat/lng pairs. Used for the
// "X.X KM AWAY" badge on the home Dealer Locator card per BUG_UI_006.
// Pure-arithmetic — no external dep.
function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Public dealer locator (PRD §6.1.1). BUG_UI_006 added address + phone +
// distanceKm to the response so the home "Find Your Dealer" card can
// render a full directory entry (name / multi-line address / phone /
// distance) without an extra fetch. Phone is the dealer's main public
// number — same one the buyer would otherwise see on the listing detail
// dealer card after submitting an enquiry, so no fresh privacy concern.
dealersRouter.get('/', validate(nearestDealersQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as { lat?: number; lng?: number; pincode?: string; radius?: number };
    const dealers = (await prisma.dealer.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        city: true,
        pincode: true,
        address: true,
        phone: true,
        latitude: true,
        longitude: true,
      },
      take: 50,
    })) as unknown as DealerLocatorRow[];

    // BUG-035: resolve reference point in priority order —
    //   1. explicit lat/lng (geolocation API result)
    //   2. pincode (buyer typed in / listing pincode prop)
    //   3. no reference (legacy / fallback) — rows return in seed order
    let ref: { lat: number; lng: number } | null = null;
    if (typeof q.lat === 'number' && typeof q.lng === 'number') {
      ref = { lat: q.lat, lng: q.lng };
    } else if (typeof q.pincode === 'string') {
      const { pincodeCoord } = await import('../listings/pincode-coords.js');
      const resolved = pincodeCoord(q.pincode);
      if (resolved) ref = resolved;
    }

    const decorated = dealers.map((d) => ({
      ...d,
      distanceKm:
        ref && d.latitude != null && d.longitude != null
          ? Number(haversineKm(ref, { lat: d.latitude, lng: d.longitude }).toFixed(1))
          : null,
    }));

    // Sort by distance when we have a reference; otherwise return in
    // creation order so seeded data stays predictable.
    if (ref) {
      decorated.sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    res.json(decorated);
  } catch (e) {
    next(e);
  }
});
