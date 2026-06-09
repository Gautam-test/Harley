import { Router } from 'express';
import { listingSearchQuery, type ListingSearchQuery } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { validate } from '../../middleware/validate.js';
import { HttpError } from '../../middleware/error-handler.js';
import { distanceKm, pincodeCoord } from './pincode-coords.js';
import { normalizeCpoDocs, normalizeInspectionUrl } from '../../utils/docUrl.js';
import { rootVin } from '../../utils/vin.js';

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
    // Exact-pincode-first lookup. Two-step fallback so a buyer typing
    // their pincode never gets "no results" when bikes ARE available
    // a few km away in the same city:
    //
    //   Step 1 — Look for any ACTIVE dealer whose pincode literally
    //            equals the buyer's pincode. If any of those dealers has
    //            ACTIVE listings, return only those bikes. No notice.
    //
    //   Step 2 — No exact-pincode dealer (or none with stock). Fall back
    //            to the distance filter: convert the buyer's pincode to
    //            a coordinate via the curated 3-digit prefix table, find
    //            dealers within `distance` km, return their bikes, and
    //            attach `meta.pincodeFallback = { searchedPincode,
    //            nearestPincode }` so the SPA can render a notice
    //            explaining the swap.
    //
    //   Step 3 — Pincode is unresolvable (unmapped 3-digit prefix or
    //            invalid digits like 000000). Return zero results;
    //            buyer sees the empty-state message.
    let dealerIdFilter: { in: string[] } | undefined;
    let pincodeFallback: { searchedPincode: string; nearestPincode: string } | null = null;
    if (q.pincode && q.distance) {
      // QA RE-OPEN: distance filter must be authoritative when explicitly
      // supplied. Previously this block ran an "exact pincode first"
      // shortcut — if a dealer existed at the exact pincode, the
      // distance filter was IGNORED and that dealer's bikes always
      // returned regardless of how narrow the radius was. The QA report
      // ("returns records outside the selected range") traces to that
      // override path.
      //
      // New rule: when BOTH pincode AND distance are present, run the
      // haversine radius filter strictly. Every dealer within radius —
      // including the exact-pincode dealer if applicable — is matched
      // by the same single rule. No silent shortcut, no overridden
      // distance.
      const buyerCoord = pincodeCoord(q.pincode);
      if (!buyerCoord) {
        // Unresolvable pincode (unmapped 3-digit prefix, 000000, etc.).
        dealerIdFilter = { in: ['__none__'] };
      } else {
        const dealers = (await prisma.dealer.findMany({
          where: { status: 'ACTIVE' },
          select: { id: true, pincode: true, latitude: true, longitude: true },
        })) as Array<{
          id: string;
          pincode: string;
          latitude: number | null;
          longitude: number | null;
        }>;
        // Separate coords-capable dealers from those missing lat/lng.
        // When ZERO dealers have coordinates (common on fresh deploys where
        // the lat/lng columns were added after initial setup and no geocoding
        // backfill has run), silently degrade: skip the distance filter and
        // return all active listings so buyers don't see an empty grid just
        // because the ops team hasn't geocoded the dealer table yet.
        const dealersWithCoords = dealers.filter(
          (d) => d.latitude != null && d.longitude != null,
        );
        const withinRange = dealersWithCoords
          .map((d) => ({
            id: d.id,
            pincode: d.pincode,
            distance: distanceKm(buyerCoord, {
              lat: d.latitude as number,
              lng: d.longitude as number,
            }),
          }))
          .filter((d) => d.distance <= (q.distance as number))
          .sort((a, b) => a.distance - b.distance);

        if (dealersWithCoords.length === 0) {
          // QA BUG-009: previously degraded to "show all" here, which
          // meant the radius filter silently returned every active bike
          // whenever the dealer table lacked lat/lng (e.g. dealers
          // created via admin without coords). That made the filter look
          // broken — buyer picks "Within 50 km" and gets bikes from
          // every city. New rule: when the buyer explicitly supplied a
          // pincode + distance, ALWAYS honour the geo constraint. If no
          // dealer has coords, the radius cannot be satisfied → return
          // zero results. Ops must geocode dealers (admin form already
          // accepts lat/lng) for the filter to surface anything.
          dealerIdFilter = { in: ['__none__'] };
        } else if (withinRange.length === 0) {
          dealerIdFilter = { in: ['__none__'] };
        } else {
          const inRangeIds = withinRange.map((d) => d.id);
          const inRangeStock = await prisma.listing.count({
            where: { dealerId: { in: inRangeIds }, status: 'ACTIVE' },
          });
          if (inRangeStock === 0) {
            dealerIdFilter = { in: ['__none__'] };
          } else {
            dealerIdFilter = { in: inRangeIds };
            // Pincode-fallback notice only fires when NO exact-pincode
            // dealer is in the radius result set. If the buyer's exact
            // pincode IS represented in withinRange, there's no need to
            // explain "showing nearest" — the buyer's pincode is in
            // the result.
            const exactInRange = withinRange.some(
              (d) => d.pincode === q.pincode,
            );
            if (!exactInRange) {
              pincodeFallback = {
                searchedPincode: q.pincode,
                nearestPincode: withinRange[0]!.pincode,
              };
            }
          }
        }
      }
    } else if (q.pincode) {
      // Pincode without distance: keep the original exact-match-first
      // behaviour so a buyer who typed "122001" still sees that
      // dealership's bikes if there's no explicit radius restriction.
      // Falls back to the unbounded result set (no dealer filter) when
      // exact match has no stock — caller can broaden via filters.
      const exactDealers = (await prisma.dealer.findMany({
        where: { status: 'ACTIVE', pincode: q.pincode },
        select: { id: true },
      })) as Array<{ id: string }>;
      if (exactDealers.length > 0) {
        const ids = exactDealers.map((d) => d.id);
        const listingCount = await prisma.listing.count({
          where: { dealerId: { in: ids }, status: 'ACTIVE' },
        });
        if (listingCount > 0) dealerIdFilter = { in: ids };
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
        // Strip the retire-prefix sentinel (sold:cmid: / removed:cmid:)
        // so the public payload never leaks the internal storage format.
        // Matters for SOLD listings still inside the 1-hour visibility
        // window — if their VIN was retired by a re-list, the raw value
        // would surface as "sold:cm123:1HD..." in the search results.
        vin: rootVin(l.vin),
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
      // Set when the buyer's pincode had no exact-match dealer and we
      // fell back to the distance filter. The SPA renders a notice:
      // "No motorcycles for pincode {searched} — showing nearest results
      // from pincode {nearest}". Omitted entirely when the exact-match
      // path succeeded or no pincode was supplied (no notice needed).
      ...(pincodeFallback ? { meta: { pincodeFallback } } : {}),
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
          // BUG-039: also surface address + phone so the PDP's
          // "View Dealer Details" modal can show the actual selling
          // dealer's contact card (not just name + city).
          select: { id: true, name: true, city: true, pincode: true, state: true, address: true, phone: true, email: true },
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
      // Defensive — public detail only serves ACTIVE listings (404 otherwise),
      // so a prefixed vin shouldn't reach here. Strip anyway for symmetry
      // with the public search payload above.
      vin: rootVin(listing.vin),
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
      // registrationNumber added in migration 20260602000000 — cast to unknown
      // until Prisma client is regenerated.
      registrationNumber: (listing as unknown as { registrationNumber: string | null }).registrationNumber ?? null,
      publishedAt: listing.publishedAt?.toISOString() ?? null,
      dealerId: listing.dealer.id,
      dealerName: listing.dealer.name,
      city: listing.dealer.city,
      // Surface the dealer's pincode + state on the public detail
      // payload so the buyer can see exactly where the bike is and use
      // the location for distance / pincode-based search refinement.
      pincode: (listing.dealer as { pincode?: string }).pincode ?? null,
      state: (listing.dealer as { state?: string }).state ?? null,
      // BUG-039: address + phone so the "View Dealer Details" modal
      // can render the actual selling dealer's contact card.
      dealerAddress: (listing.dealer as { address?: string | null }).address ?? null,
      dealerPhone: (listing.dealer as { phone?: string | null }).phone ?? null,
      // Selling dealer email — surfaced on the "View Dealer Details" modal
      // alongside phone so the buyer can reach the dealer by either channel.
      dealerEmail: (listing.dealer as { email?: string | null }).email ?? null,
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
