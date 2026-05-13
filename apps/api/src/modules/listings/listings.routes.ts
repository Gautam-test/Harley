import { Router } from 'express';
import { listingSearchQuery, type ListingSearchQuery } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { distanceKm, pincodeCoord } from './pincode-coords.js';
import { normalizeCpoDocs, normalizeInspectionUrl } from '../../utils/docUrl.js';

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
  status: 'DRAFT' | 'ACTIVE' | 'SOLD' | 'REMOVED' | 'DEACTIVATED';
  soldAt: Date | null;
  dealer: { id?: string; name: string; city: string; pincode: string };
}

// SOLD listings stay visible to buyers for one hour after the dealer hits
// "Mark Sold" — long enough for the buyer who saw the bike in their last
// session to spot the SOLD watermark and understand why their pick is gone.
// After the window the listing 404s on the public site exactly like REMOVED.
const SOLD_VISIBILITY_MS = 60 * 60 * 1000;

export const listingsRouter = Router();

// PRD §6.1.2 — public buyer search. URL-driven filters; pagination 12 per page.
listingsRouter.get('/', validate(listingSearchQuery, 'query'), async (req, res, next) => {
  try {
    const q = req.query as unknown as ListingSearchQuery;

    // ─── Dealer-radius pre-filter (PRD §6.1.2 distance filter) ──────────
    // When the buyer supplied a pincode + distance, look up the pincode's
    // approximate (lat, lng) and find dealers within `distance` km. The
    // listings query is then constrained to those dealerIds.
    //
    // Lookup is layered: an exact 3-digit prefix returns match='exact';
    // an unmapped prefix in a known region returns match='region' with
    // the regional metro centroid (so the filter still fires); a malformed
    // pincode returns match='invalid' and the filter is skipped entirely.
    // pincodeMatch surfaces in the response so the SPA can tell the buyer
    // when results are an approximation.
    let dealerIdFilter: { in: string[] } | undefined;
    let pincodeMatch: 'exact' | 'region' | 'invalid' | null = null;
    if (q.pincode && q.distance) {
      const lookup = pincodeCoord(q.pincode);
      pincodeMatch = lookup.match;
      if (lookup.coord) {
        const buyerCoord = lookup.coord;
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

    // Visibility window: ACTIVE listings always show up; SOLD listings
    // surface for SOLD_VISIBILITY_MS (1h) after the dealer marked them
    // sold so the search grid can render a SOLD watermark before the row
    // disappears entirely. After the window, the SOLD row drops off the
    // grid as if REMOVED.
    const soldVisibleSince = new Date(Date.now() - SOLD_VISIBILITY_MS);
    const visibilityFilter = {
      OR: [
        { status: 'ACTIVE' as const },
        { status: 'SOLD' as const, soldAt: { gte: soldVisibleSince } },
      ],
    };
    const where = {
      ...visibilityFilter,
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
        include: { dealer: { select: { name: true, city: true, pincode: true } } },
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
        // Status surfaces SOLD rows in the 1-hour visibility window — the
        // buyer card overlays a SOLD watermark and disables the click-
        // through to the (now-404'd shortly) detail page.
        status: l.status,
        soldAt: l.soldAt?.toISOString() ?? null,
        dealerName: l.dealer.name,
        city: l.dealer.city,
        pincode: l.dealer.pincode,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      // pincodeMatch tells the buyer SPA whether the radius filter ran
      // against the exact 3-digit prefix centroid or fell back to the
      // 1-digit region centroid. 'invalid' = pincode was unmapped and no
      // filter ran. null = pincode/distance weren't supplied.
      meta: { pincodeMatch },
    });
  } catch (e) {
    next(e);
  }
});

// PRD §6.1.3 — public listing detail by slug. 404 on every non-ACTIVE
// status. SOLD intentionally drops the 1-hour grace window here (QA: the
// detail page must be fully blocked once a bike is sold). The search grid
// still surfaces the SOLD row for the 1-hour visibility window so buyers
// browsing /search see a watermarked card and understand why the bike
// they were tracking has vanished, but clicking it on the grid now lands
// on the NotFound page rather than a fully-interactive detail with a
// purely visual overlay.
listingsRouter.get('/:slug', async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { slug: req.params.slug },
      include: {
        dealer: {
          select: { id: true, name: true, city: true, pincode: true, state: true },
        },
      },
    });
    if (!listing) throw new HttpError(404, 'NOT_FOUND', 'Listing not found');
    if (listing.status !== 'ACTIVE') {
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
      // Status + soldAt surface SOLD rows still inside the 1-hour grace
      // window so the buyer detail page can render the "SOLD" overlay on
      // every gallery image and disable the Enquire CTA.
      status: listing.status,
      soldAt: listing.soldAt?.toISOString() ?? null,
      // Legacy rows stored CPO-kit URLs against `https://torque.mock` and a
      // few inspection rows used bare filenames; normalise both shapes so
      // anchor clicks resolve through the API instead of triggering a DNS
      // failure or hitting the wrong relative path (QA BUG-19).
      inspectionReportUrl: normalizeInspectionUrl(listing.inspectionReportUrl),
      cpoDocs: normalizeCpoDocs(listing.cpoDocs),
      // `owners` joined the Listing model in migration 20260506100000_listing_add_owners.
      // The generated Prisma type is typed-cast here until the next clean
      // regenerate; engine queries already select all columns.
      owners: (listing as unknown as { owners: number | null }).owners ?? null,
      publishedAt: listing.publishedAt?.toISOString() ?? null,
      dealerId: listing.dealer.id,
      dealerName: listing.dealer.name,
      city: listing.dealer.city,
      // Surface the dealer's pincode + state on the public detail
      // payload so the buyer can see exactly where the bike is and use
      // the location for distance / pincode-based search refinement.
      pincode: (listing.dealer as { pincode?: string }).pincode ?? null,
      state: (listing.dealer as { state?: string }).state ?? null,
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
