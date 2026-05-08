import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CreateListingInput, UpdateListingInput } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { getEnv } from '../../config/env.js';
import { HttpError } from '../../middleware/error-handler.js';
import { torque } from '../torque/torque.module.js';
import { buildListingSlug } from '../../utils/slug.js';
import { decodeVinYear } from '../../utils/vinYear.js';

// Short random discriminator used to disambiguate slugs when two listings
// share year + model + last-6-of-VIN. 4 hex chars = 65k possibilities,
// well above the chance of a second collision after one retry.
function slugDiscriminator(): string {
  return randomBytes(2).toString('hex');
}

export async function createListing(dealerId: string, input: CreateListingInput) {
  // PRD §6.2.3 AC1 — VIN must exist in Torque AND be assigned to this dealer.
  const vehicle = await torque.getVehicleByVin(input.vin);
  if (!vehicle) throw new HttpError(404, 'TORQUE_VIN_NOT_FOUND', 'VIN not found in Torque');

  const dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) throw new HttpError(404, 'DEALER_NOT_FOUND', 'Dealer not found');
  if (dealer.torqueDealerId && vehicle.dealerId !== dealer.torqueDealerId) {
    throw new HttpError(403, 'VIN_NOT_ASSIGNED', 'VIN is not assigned to this dealer in Torque');
  }

  // PRD §6.2.3 AC2 — duplicate VIN check, exclude REMOVED.
  //
  // The DB-level `vin` unique constraint covers REMOVED listings too, so a
  // dealer who tries to re-list a previously-removed bike would have hit
  // a 500 (P2002 on `vin`). We free up the constraint by retiring the old
  // REMOVED row's vin + slug to a sentinel value before the create — the
  // history row stays for audit, but its identifying keys are released.
  const existing = await prisma.listing.findUnique({ where: { vin: input.vin } });
  if (existing && existing.status !== 'REMOVED') {
    throw new HttpError(
      409,
      'VIN_DUPLICATE',
      'A listing for this VIN is already live or pending. Mark the previous one Sold or Removed before re-listing.',
    );
  }
  if (existing && existing.status === 'REMOVED') {
    // Suffix with the row id so the historical record stays unique among
    // any number of past REMOVED listings for the same VIN.
    await prisma.listing.update({
      where: { id: existing.id },
      data: {
        vin: `removed:${existing.id}:${existing.vin}`,
        slug: `removed-${existing.id}-${existing.slug}`,
      },
    });
  }

  // Year is not in Torque's seven-field payload (VIN, ENGINE, MODEL NAME,
  // MODEL FAMILY, COLOR, CUSTOMER NAME, DATE OF INVOICE) — derive it from
  // the VIN's 10th character, which is industry-standard for model year.
  let year: number;
  try {
    year = decodeVinYear(input.vin);
  } catch (e) {
    throw new HttpError(
      400,
      'INVALID_VIN_YEAR',
      e instanceof Error ? e.message : 'Could not decode model year from VIN',
    );
  }

  const baseSlug = buildListingSlug(year, vehicle.modelName, input.vin);

  // Default trust model (PRD §6.3.4): create as DRAFT, admin reviews + publishes.
  // For demos / sales walk-throughs the LISTINGS_AUTO_PUBLISH env flag flips
  // this to a one-step flow — listing lands as ACTIVE immediately.
  const autoPublish = getEnv().LISTINGS_AUTO_PUBLISH;
  const now = new Date();

  // Slug = `${year}-${model-slug}-${last-6-of-VIN}`. Two listings with
  // matching year + model + last-6 chars collide on the unique slug, which
  // used to surface as 500 INTERNAL_ERROR when a dealer hit Submit. Retry
  // up to 3 times with a short random discriminator on collision; that
  // gives 65k^3 distinct fall-back slugs which comfortably outruns realistic
  // collision rates without ever needing to surface the failure to the dealer.
  const buildData = (slug: string) => ({
    vin: input.vin,
    slug,
    dealerId,
    modelFamily: vehicle.modelFamily,
    modelName: vehicle.modelName,
    year,
    colour: vehicle.colour,
    price: input.price,
    kmsDriven: input.kmsDriven,
    // `owners` was added to the Prisma schema in migration 20260506100000.
    // Using a typed cast until the next clean `prisma generate` regenerates
    // the client types — the migration has already been applied to the DB,
    // so the column write succeeds at the engine layer.
    ...({ owners: input.owners } as Record<string, unknown>),
    description: input.description,
    images: input.images,
    certificationStatus: input.certificationStatus,
    inspectionReportUrl: input.inspectionReportUrl,
    cpoDocs: input.cpoDocs ?? undefined,
    status: autoPublish ? ('ACTIVE' as const) : ('DRAFT' as const),
    publishedAt: autoPublish ? now : null,
  });

  let listing;
  let slug = baseSlug;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      listing = await prisma.listing.create({ data: buildData(slug) });
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = (e.meta?.target as string[] | undefined) ?? [];
        if (target.includes('slug') && attempt < 3) {
          slug = `${baseSlug}-${slugDiscriminator()}`;
          logger.info({ vin: input.vin, attempt, slug }, 'Slug collision, retrying with discriminator');
          continue;
        }
        if (target.includes('vin')) {
          // Should be unreachable given the upfront vin dedup + REMOVED-row
          // retirement above, but if a race slipped through we surface a
          // clean 409 instead of the 500 the raw Prisma error produced.
          throw new HttpError(
            409,
            'VIN_DUPLICATE',
            'A listing for this VIN was created concurrently. Please refresh and try again.',
          );
        }
      }
      throw e;
    }
  }
  if (!listing) {
    throw new HttpError(
      500,
      'SLUG_GENERATION_FAILED',
      'Could not generate a unique slug for this listing after 4 attempts.',
    );
  }

  // PRD §7.1 — push inspection PDF to Torque if provided.
  if (input.inspectionReportUrl) {
    try {
      await torque.pushInspectionReport(input.vin, input.inspectionReportUrl);
    } catch (e) {
      logger.warn({ err: e, vin: input.vin }, 'Torque inspection-report push failed; will retry');
    }
  }

  return listing;
}

// publishListing intentionally lives in admin-listings.routes.ts — only an admin
// has the authority to move a DRAFT into ACTIVE (visible to buyers).

export async function markSold(dealerId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.dealerId !== dealerId) {
    throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  }
  if (listing.status !== 'ACTIVE') {
    throw new HttpError(409, 'INVALID_STATE', 'Only ACTIVE listings can be marked sold');
  }
  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: { status: 'SOLD', soldAt: new Date() },
  });
  try {
    await torque.updateVehicleStatus(listing.vin, 'SOLD');
  } catch (e) {
    logger.warn({ err: e, vin: listing.vin }, 'Torque sold-status push failed; will retry');
  }
  return updated;
}

export async function updateListing(
  dealerId: string,
  listingId: string,
  input: UpdateListingInput,
) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.dealerId !== dealerId) {
    throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  }
  // PRD §6.2.4 — only price/description/KMs/images editable; VIN + spec locked.
  // Clear adminFeedback on any dealer edit so the red banner disappears once
  // the dealer has acted on it; the next admin review starts from a clean slate.
  //
  // The Zod schema accepts `cpoDocs: null` (used when a dealer flips a CPO
  // listing back to AS_IS), but Prisma's typed JSON column rejects raw null
  // — mirror createListing's `?? undefined` shim so the column is left
  // untouched on null. Same for inspectionReportUrl: the column itself is
  // nullable in the DB so passing null is fine, but the spread keeps the
  // explicit-null intent intact.
  const { cpoDocs, ...rest } = input;
  return prisma.listing.update({
    where: { id: listingId },
    data: {
      ...rest,
      ...(cpoDocs === undefined ? {} : { cpoDocs: cpoDocs ?? undefined }),
      adminFeedback: null,
    },
  });
}

export async function softRemove(dealerId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.dealerId !== dealerId) {
    throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  }
  return prisma.listing.update({ where: { id: listingId }, data: { status: 'REMOVED' } });
}

// Dealer "Turn Off" — temporarily hide an ACTIVE listing without removing it.
// Mirrors the freeze My Listings design's TURN OFF / TURN ON button pair.
export async function setActiveToggle(dealerId: string, listingId: string, on: boolean) {
  const listing = await prisma.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.dealerId !== dealerId) {
    throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found');
  }
  const next = on ? 'ACTIVE' : 'DEACTIVATED';
  if (on && listing.status !== 'DEACTIVATED') {
    throw new HttpError(409, 'INVALID_STATE', 'Only deactivated listings can be turned back on');
  }
  if (!on && listing.status !== 'ACTIVE') {
    throw new HttpError(409, 'INVALID_STATE', 'Only active listings can be turned off');
  }
  return prisma.listing.update({ where: { id: listingId }, data: { status: next } });
}

// Local row type — kept narrow so this module typechecks before `prisma generate` runs.
// Once the generated client is in place its inferred type is structurally compatible.
interface DealerListingDbRow {
  id: string;
  vin: string;
  slug: string;
  modelName: string;
  year: number;
  price: { toString(): string };
  kmsDriven: number;
  certificationStatus: 'CPO' | 'AS_IS';
  status: string;
  images: string[];
  adminFeedback: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

// Fetch a single full listing for the edit wizard to hydrate from. Returns
// every field the AddListingPage needs to repopulate its FormState — VIN,
// price, KMs, owners, description, image URLs, inspection URL, cert status.
// Scoped to the calling dealer to prevent cross-dealer reads.
export async function getDealerListing(dealerId: string, listingId: string) {
  const row = await prisma.listing.findFirst({
    where: { id: listingId, dealerId },
    select: {
      id: true,
      vin: true,
      slug: true,
      modelName: true,
      modelFamily: true,
      year: true,
      colour: true,
      price: true,
      kmsDriven: true,
      owners: true,
      description: true,
      images: true,
      inspectionReportUrl: true,
      certificationStatus: true,
      status: true,
      adminFeedback: true,
      cpoDocs: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) return null;
  return {
    ...row,
    price: Number(row.price),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listForDealer(dealerId: string, status?: string) {
  const rows = (await prisma.listing.findMany({
    where: { dealerId, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: 'desc' },
  })) as unknown as DealerListingDbRow[];
  return rows.map((l) => ({
    id: l.id,
    vin: l.vin,
    slug: l.slug,
    modelName: l.modelName,
    year: l.year,
    price: Number(l.price),
    kmsDriven: l.kmsDriven,
    certificationStatus: l.certificationStatus,
    status: l.status,
    primaryImage: l.images[0] ?? null,
    adminFeedback: l.adminFeedback,
    publishedAt: l.publishedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
  }));
}
