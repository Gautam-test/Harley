import { Router } from 'express';
import { listingSearchQuery, type ListingSearchQuery } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { distanceKm, pincodeCoord } from './pincode-coords.js';

// Narrow row shapes — make this module typecheck before `prisma generate` runs.
// The generated client returns structurally-compatible types.
interface PublicListingRow {
  id: string;
  slug: string;
  vin: string;
  modelFamily: string;
  modelName: string;
  year: number;
  colour: string;
  price: { toString(): string };
  kmsDriven: number;
  images: string[];
  certificationStatus: 'CPO' | 'AS_IS';
  dealer: { id?: string; name: string; city: string };
}

export const listingsRouter = Router();

// PRD §6.1.2 — public buyer search. URL-driven filters; pagination 12 per page.
listingsRouter.get('/', validate(listingSearchQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as ListingSearchQuery;

    // ─── Dealer-radius pre-filter (PRD §6.1.2 distance filter) ──────────
    // When the buyer supplied a pincode + distance, look up the pincode's
    // approximate (lat, lng) and find dealers within `distance` km. The
    // listings query is then constrained to those dealerIds. If we can't
    // resolve the pincode (unknown prefix), we skip the filter rather than
    // silently lie to the buyer.
    let dealerIdFilter: { in: string[] } | undefined;
    if (q.pincode && q.distance) {
      const buyerCoord = pincodeCoord(q.pincode);
      if (buyerCoord) {
        const dealers = (await prisma.dealer.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, latitude: true, longitude: true },
        })) as Array<{ id: string; latitude: number | null; longitude: number | null }>;
        const withinRange = dealers
          .filter((d) => d.latitude != null && d.longitude != null)
          .filter(
            (d) =>
              distanceKm(buyerCoord, { lat: d.latitude as number, lng: d.longitude as number }) <=
              (q.distance as number),
          )
          .map((d) => d.id);
        // No dealers in range → return an empty result set explicitly so the
        // total reflects the actual filtered count instead of "everything".
        dealerIdFilter = { in: withinRange.length > 0 ? withinRange : ['__none__'] };
      }
    }

    const where = {
      status: 'ACTIVE' as const,
      ...(dealerIdFilter ? { dealerId: dealerIdFilter } : {}),
      ...(q.modelFamily ? { modelFamily: q.modelFamily } : {}),
      ...(q.model ? { modelName: q.model } : {}),
      ...(q.cert ? { certificationStatus: q.cert } : {}),
      ...(q.colour ? { colour: { contains: q.colour, mode: 'insensitive' as const } } : {}),
      ...(q.maxPrice ? { price: { lte: q.maxPrice } } : {}),
      ...(q.minYear || q.maxYear
        ? {
            year: {
              ...(q.minYear ? { gte: q.minYear } : {}),
              ...(q.maxYear ? { lte: q.maxYear } : {}),
            },
          }
        : {}),
      ...(q.minKms || q.maxKms
        ? {
            kmsDriven: {
              ...(q.minKms ? { gte: q.minKms } : {}),
              ...(q.maxKms ? { lte: q.maxKms } : {}),
            },
          }
        : {}),
    };

    const orderBy =
      q.sort === 'priceAsc'
        ? { price: 'asc' as const }
        : q.sort === 'priceDesc'
        ? { price: 'desc' as const }
        : q.sort === 'kmsAsc'
        ? { kmsDriven: 'asc' as const }
        : { publishedAt: 'desc' as const };

    const [resultsRaw, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { dealer: { select: { name: true, city: true } } },
      }),
      prisma.listing.count({ where }),
    ]);
    const results = resultsRaw as unknown as PublicListingRow[];

    res.json({
      results: results.map((l) => ({
        id: l.id,
        slug: l.slug,
        vin: l.vin,
        modelFamily: l.modelFamily,
        modelName: l.modelName,
        year: l.year,
        colour: l.colour,
        price: Number(l.price),
        kmsDriven: l.kmsDriven,
        primaryImage: l.images[0] ?? '',
        certificationStatus: l.certificationStatus,
        dealerName: l.dealer.name,
        city: l.dealer.city,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (e) {
    next(e);
  }
});

// PRD §6.1.3 — public listing detail by slug. 404 on SOLD/REMOVED/DEACTIVATED (AC5).
listingsRouter.get('/:slug', async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { slug: req.params.slug },
      include: { dealer: { select: { id: true, name: true, city: true } } },
    });
    if (!listing || listing.status !== 'ACTIVE') {
      throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
    }
    res.json({
      id: listing.id,
      slug: listing.slug,
      vin: listing.vin,
      modelFamily: listing.modelFamily,
      modelName: listing.modelName,
      year: listing.year,
      colour: listing.colour,
      price: Number(listing.price),
      kmsDriven: listing.kmsDriven,
      description: listing.description,
      images: listing.images,
      primaryImage: listing.images[0] ?? '',
      certificationStatus: listing.certificationStatus,
      inspectionReportUrl: listing.inspectionReportUrl,
      cpoDocs: listing.cpoDocs,
      // `owners` joined the Listing model in migration 20260506100000_listing_add_owners.
      // The generated Prisma type is typed-cast here until the next clean
      // regenerate; engine queries already select all columns.
      owners: (listing as unknown as { owners: number | null }).owners ?? null,
      publishedAt: listing.publishedAt?.toISOString() ?? null,
      dealerId: listing.dealer.id,
      dealerName: listing.dealer.name,
      city: listing.dealer.city,
    });
  } catch (e) {
    next(e);
  }
});

// Lightweight config endpoints used by the buyer hero search.
listingsRouter.get('/_config/model-families', async (_req, res, next) => {
  try {
    const families = (await prisma.listing.groupBy({
      by: ['modelFamily'],
      where: { status: 'ACTIVE' },
    })) as unknown as Array<{ modelFamily: string }>;
    res.json(families.map((f) => f.modelFamily).sort());
  } catch (e) {
    next(e);
  }
});
