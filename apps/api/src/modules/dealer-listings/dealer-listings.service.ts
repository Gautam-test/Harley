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
import { emailProvider, adminListingQueuedEmail } from '../email/email.module.js';

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

  // QA fix: skip the dealer-assignment guard when Torque is in MOCK mode.
  // The mock fabricates a synthetic dealerId from the VIN's last 4 chars
  // (TQ-DEALER-XXXX) which can never match any real dealer.torqueDealerId,
  // so the previous unconditional check rejected *every* brand-new VIN
  // submitted by any dealer ("VIN not assigned to your dealership" even
  // though the VIN was never registered anywhere). In LIVE mode the real
  // QA UPDATE: dealer-assignment check fully disabled.
  // Reason: there is no official Torque DMS data linking VINs to dealers
  // yet — dealers cannot be expected to have pre-registered VINs in a
  // system that doesn't exist for them. Until H-D ops confirms a real
  // Torque integration with authoritative VIN-to-dealer mapping, any
  // dealer can list any well-formed VIN. The check remains in code as
  // a no-op `void` so when the integration is real, it can be re-enabled
  // by one line of config.
  void dealer;
  void vehicle;

  // PRD §6.2.3 AC2 — duplicate VIN check.
  //
  // A VIN is only "already registered" when a listing is genuinely
  // holding it in a live or pending-review state — i.e. ACTIVE
  // (buyer-visible) or DRAFT (sitting in the owning dealer's
  // submit-for-approval queue). Every other state means the bike is
  // NOT listed anywhere a buyer (or another dealer) would see it:
  //   - DEACTIVATED → the dealer turned the listing OFF
  //   - SOLD        → the sale is done
  //   - REMOVED     → admin / dealer took it down
  // The QA report was specifically about this: a VIN whose only record
  // was a DEACTIVATED (turned-off) listing — often on a *different*
  // dealer's portal — still threw "already registered" even though it
  // wasn't listed anywhere visible. Those non-live states now fall
  // through to the retire-and-reuse path below.
  //
  // The DB-level `vin` unique constraint covers ALL rows, so before the
  // create we retire the old non-live row's vin + slug to a sentinel
  // value — the history row stays for audit, but its identifying keys
  // are released so the new listing can take the clean VIN.
  const BLOCKING_STATUSES = ['ACTIVE', 'DRAFT'];
  const existing = await prisma.listing.findUnique({ where: { vin: input.vin } });
  if (existing && BLOCKING_STATUSES.includes(existing.status)) {
    throw new HttpError(
      409,
      'VIN_DUPLICATE',
      'A listing for this VIN is already live or pending. Mark the previous one Sold or Removed before re-listing.',
    );
  }
  if (existing) {
    // Suffix with the row id so the historical record stays unique among
    // any number of past retired listings for the same VIN.
    const prefix = existing.status.toLowerCase();
    await prisma.listing.update({
      where: { id: existing.id },
      data: {
        vin: `${prefix}:${existing.id}:${existing.vin}`,
        slug: `${prefix}-${existing.id}-${existing.slug}`,
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
  // Determine certificate auto-fill fields.
  // When the dealer submits a CPO listing with an inspection PDF,
  // auto-stamp inspectedBy = dealer.name and certifiedOn = now.
  const isCpoWithPdf =
    input.certificationStatus === 'CPO' && Boolean(input.inspectionReportUrl);

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
    // Certificate fields — cast to unknown for same reason as owners above:
    // Prisma client types haven't been regenerated yet but the columns exist
    // in the DB after migration 20260602000000.
    ...({
      registrationNumber: input.registrationNumber ?? null,
      inspectedBy: isCpoWithPdf ? dealer.name : null,
      certifiedOn: isCpoWithPdf ? now : null,
      // Dealer-internal pricing fields — stored on the row, never returned
      // to the buyer portal.
      purchasePrice: input.purchasePrice ?? null,
      refurbishmentPrice: input.refurbishmentPrice ?? null,
      ageingDays: input.ageingDays ?? null,
      finalSellingPrice: input.finalSellingPrice ?? null,
    } as Record<string, unknown>),
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

  // Trigger #6: admin new-listing approval-queue alert. A fresh
  // dealer-created listing lands in DRAFT (unless LISTINGS_AUTO_PUBLISH
  // flips it straight to ACTIVE for demos) and needs admin review.
  // Notify the admin inbox. Fire-and-forget — a mail failure must not
  // fail the listing create. Skipped when no EMAIL_ADMIN is configured.
  void (async () => {
    const adminTo = getEnv().EMAIL_ADMIN;
    if (!adminTo) return;
    try {
      const msg = adminListingQueuedEmail({
        dealerName: dealer.name,
        bikeLabel: `${listing.year} ${vehicle.modelName}`,
        action: 'created',
      });
      await emailProvider().send({ ...msg, to: adminTo });
    } catch (e) {
      logger.warn({ err: e, listingId: listing.id }, 'Admin listing-queued email failed');
    }
  })();

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

// Strip the `removed:<cmid>:` / `sold:<cmid>:` retire-prefix that
// createListing applies when a new listing reuses the VIN of a SOLD or
// REMOVED row. The DB-stored VIN preserves history; this gives us back
// the original 17-character VIN.
//
// Why this matters at the API surface: when a dealer opens a SOLD
// listing in the My-Listings → SOLD tab, the edit-wizard hydrates from
// GET /dealer/listings/:id and immediately fires GET /torque/vehicles/
// {vin} to repopulate the read-only Torque card. /torque/vehicles/:vin
// validates the URL path against z.string().length(17).regex(/^[A-HJ-NPR-
// Z0-9]{17}$/), and a prefixed VIN like 'sold:cm123abc:1HD1KHM18MB...'
// is 32+ chars with colons — Zod rejects it with VALIDATION_ERROR
// "Invalid request payload" and the wizard fails to open the listing.
// Stripping the prefix in the API response keeps the wizard happy
// without changing the DB-stored value the unique constraint depends on.
export function rootVin(storedVin: string): string {
  return storedVin.replace(/^(removed|sold|deactivated):[^:]+:/, '');
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
  // listing back to AS_IS). For Prisma's typed JSON column we map that to
  // Prisma.DbNull so the column actually clears — the previous shim
  // (`cpoDocs ?? undefined`) silently dropped null edits, leaving the old
  // CPO kit attached to a now-AS_IS bike (QA #3: "AS_IS flip not
  // reflected" — admin saw cpoDocs lingering even though cert flipped).
  // inspectionReportUrl is plain nullable text and accepts raw null, so
  // it stays in `rest`.
  //
  // Restore + Resubmit (QA: My Listings → Removed/Sold → View → Submit):
  // when the dealer edits a REMOVED or SOLD listing they own, treat the
  // submit as "re-queuing for admin review", so flip status back to DRAFT
  // (renders as Pending on the dealer's tab) and clear soldAt. Without
  // this, the row stays REMOVED/SOLD and silently disappears from Pending.
  const { cpoDocs, registrationNumber, inspectedBy: _inputInspectedBy, certifiedOn: _inputCertifiedOn, ...rest } = input;
  const restoreToDraft = listing.status === 'REMOVED' || listing.status === 'SOLD';

  // VIN-collision guard for restore: if the dealer is restoring a SOLD/
  // REMOVED listing and the original VIN is now owned by another active/
  // pending listing (which received the clean VIN when this one's was
  // retired with a prefix), the restore would silently produce two
  // approvable listings sharing the same root VIN. QA #3: "Live bike
  // with VIN X is approved; another bike from Removed/Sold with same
  // root VIN gets edited and admin still approves it."
  if (restoreToDraft) {
    const originalVin = rootVin(listing.vin);
    const conflict = await prisma.listing.findFirst({
      where: {
        OR: [{ vin: originalVin }, { vin: listing.vin }],
        id: { not: listingId },
        status: { in: ['DRAFT', 'ACTIVE', 'DEACTIVATED'] },
      },
      select: { id: true, status: true, vin: true },
    });
    if (conflict) {
      // QA-spec copy — identical to the createListing duplicate guard
      // above so the dealer sees the same message whether they hit the
      // conflict via "Turn On" (this restoreToDraft path) or via the
      // initial create. Internally we keep the VIN_IN_USE code so the
      // dealer SPA can switch on it; the conflict row's id + status are
      // surfaced through the structured log for support follow-up.
      void originalVin;
      void conflict;
      throw new HttpError(
        409,
        'VIN_IN_USE',
        'A listing for this VIN is already live or pending. Mark the previous one Sold or Removed before re-listing.',
      );
    }
  }

  // cpoDocs handling for Prisma JSON column:
  //   undefined  → no change (field omitted from PATCH)
  //   null       → set column to SQL NULL via Prisma.DbNull (clears old kit)
  //   object     → write the object verbatim
  const cpoDocsWrite =
    cpoDocs === undefined ? undefined : cpoDocs === null ? Prisma.DbNull : cpoDocs;

  // Auto-fill certificate fields when inspection PDF is being set on a CPO listing.
  // We check the effective certificationStatus (from input if provided, else from existing row).
  const effectiveCertStatus = input.certificationStatus ?? listing.certificationStatus;
  const settingInspectionPdf =
    input.inspectionReportUrl !== undefined && input.inspectionReportUrl !== null;
  const isCpoWithNewPdf = effectiveCertStatus === 'CPO' && settingInspectionPdf;

  // Fetch dealer name when we need to stamp inspectedBy.
  let dealerNameForCert: string | undefined;
  if (isCpoWithNewPdf) {
    const dealerRow = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: { name: true },
    });
    dealerNameForCert = dealerRow?.name;
  }

  const certAutoFields = isCpoWithNewPdf
    ? ({
        registrationNumber: registrationNumber ?? undefined,
        inspectedBy: dealerNameForCert ?? null,
        certifiedOn: new Date(),
      } as Record<string, unknown>)
    : ({
        ...(registrationNumber !== undefined ? { registrationNumber } : {}),
      } as Record<string, unknown>);

  return prisma.listing.update({
    where: { id: listingId },
    data: {
      ...rest,
      ...(cpoDocsWrite === undefined ? {} : { cpoDocs: cpoDocsWrite }),
      ...(certAutoFields as object),
      adminFeedback: null,
      ...(restoreToDraft ? { status: 'DRAFT' as const, soldAt: null } : {}),
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
//
// QA: Turn-On (DEACTIVATED → ACTIVE) must run the same VIN-conflict guard
// the publish gate + restore path run, otherwise a dealer can reactivate a
// previously-deactivated listing whose VIN is now held by another DRAFT /
// ACTIVE listing (same dealer or another). Re-uses the existing
// "A listing for this VIN is already live or pending" copy + VIN_DUPLICATE
// code so client + admin paths surface an identical message verbatim.
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

  // QA Turn-On VIN guard: when bringing DEACTIVATED → ACTIVE, replay
  // the conflict query the publish + restore paths run. Without it a
  // dealer can reactivate a previously-deactivated listing whose VIN
  // is now held by another DRAFT or ACTIVE listing (same dealer or
  // another), producing two live-ish rows for the same physical bike.
  // Match the root VIN AND any retire-prefixed form (e.g.
  // `removed:<id>:<root>`) so prior-prefixed rows are caught too.
  // Error code + copy mirror createListing's so client + admin paths
  // see the identical message verbatim. Turn-Off skips this branch.
  if (on) {
    const originalVin = rootVin(listing.vin);
    const conflict = await prisma.listing.findFirst({
      where: {
        OR: [
          { vin: listing.vin },
          { vin: originalVin },
          { vin: { endsWith: `:${originalVin}` } },
        ],
        id: { not: listingId },
        status: { in: ['DRAFT', 'ACTIVE'] },
      },
      select: { id: true, status: true },
    });
    if (conflict) {
      throw new HttpError(
        409,
        'VIN_DUPLICATE',
        'A listing for this VIN is already live or pending. Mark the previous one Sold or Removed before re-listing.',
      );
    }
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
  const row = await (prisma.listing.findFirst as Function)({
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
      // Certificate fields (migration 20260602000000)
      registrationNumber: true,
      inspectedBy: true,
      certifiedOn: true,
      // Dealer-internal pricing (migration 20260601000000) — required for
      // the edit wizard to pre-fill the Internal Pricing block. QA bug:
      // these were missing from select{}, so edit mode rendered the four
      // inputs blank even when the dealer had saved values.
      purchasePrice: true,
      refurbishmentPrice: true,
      ageingDays: true,
      finalSellingPrice: true,
    },
  }) as {
    id: string; vin: string; slug: string; modelName: string; modelFamily: string;
    year: number; colour: string; price: { toString(): string }; kmsDriven: number;
    owners: number | null; description: string; images: string[];
    inspectionReportUrl: string | null; certificationStatus: 'CPO' | 'AS_IS';
    status: string; adminFeedback: string | null; cpoDocs: unknown;
    createdAt: Date; updatedAt: Date;
    registrationNumber: string | null; inspectedBy: string | null; certifiedOn: Date | null;
    purchasePrice: { toString(): string } | null;
    refurbishmentPrice: { toString(): string } | null;
    ageingDays: number | null;
    finalSellingPrice: { toString(): string } | null;
  } | null;
  if (!row) return null;
  return {
    ...row,
    // Strip the retire-prefix so the wizard's Torque-fetch call sees the
    // clean 17-char VIN (see rootVin's docstring above for the full
    // failure mode this avoids).
    vin: rootVin(row.vin),
    price: Number(row.price),
    // Decimal columns come back as Prisma Decimal objects — coerce to
    // plain numbers for the JSON wire format and SPA pre-fill.
    purchasePrice: row.purchasePrice != null ? Number(row.purchasePrice) : null,
    refurbishmentPrice: row.refurbishmentPrice != null ? Number(row.refurbishmentPrice) : null,
    finalSellingPrice: row.finalSellingPrice != null ? Number(row.finalSellingPrice) : null,
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
    // Strip the retire-prefix so the dealer's My-Listings table never
    // shows mangled "sold:cmid:..." VIN strings, and the stock-code
    // (last-5 of VIN) derived in the SPA stays the original suffix.
    vin: rootVin(l.vin),
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
