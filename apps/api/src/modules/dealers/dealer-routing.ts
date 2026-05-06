import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';

interface DealerLite {
  id: string;
  name: string;
  city: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
}

// Great-circle distance in km between two lat/lng points (Haversine).
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // earth radius in km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// PRD §6.1.4 AC4 — assign general leads to the nearest active dealer using great-circle
// distance. Falls back to the first active dealer if no buyer geo is available.
export async function nearestActiveDealer(buyerLat?: number, buyerLng?: number): Promise<string> {
  const dealersRaw = (await prisma.dealer.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, city: true, pincode: true, latitude: true, longitude: true },
  })) as unknown as DealerLite[];
  if (dealersRaw.length === 0) {
    throw new HttpError(503, 'NO_ACTIVE_DEALER', 'No active dealer available to receive leads');
  }
  if (buyerLat === undefined || buyerLng === undefined) return dealersRaw[0]!.id;

  const ranked = dealersRaw
    .filter((d): d is DealerLite & { latitude: number; longitude: number } =>
      d.latitude !== null && d.longitude !== null,
    )
    .map((d) => ({ id: d.id, distance: haversineKm(buyerLat, buyerLng, d.latitude, d.longitude) }))
    .sort((a, b) => a.distance - b.distance);

  return ranked[0]?.id ?? dealersRaw[0]!.id;
}
