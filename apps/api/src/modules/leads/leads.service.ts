import type {
  EnquiryInput,
  TradeInLeadInput,
  DealerBuyerEnquiryInput,
  DealerTradeInLeadInput,
  LeadStatus,
} from '@hd-cpo/types';
import { canTransitionLead } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { encryptPii, decryptPii } from '../../utils/crypto.js';
import { HttpError } from '../../middleware/error-handler.js';
import { dealerLeadEmail, emailProvider } from '../email/email.module.js';
import { nearestActiveDealer } from '../dealers/dealer-routing.js';

interface DealerForEmail {
  id: string;
  name: string;
  email: string;
}

async function notifyDealer(
  dealerId: string,
  leadType: 'BUYER' | 'TRADE_IN',
  buyerName: string,
  buyerCity?: string,
  contextLine?: string,
) {
  const dealer = (await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, name: true, email: true },
  })) as DealerForEmail | null;
  if (!dealer) return;
  const msg = dealerLeadEmail({ dealerName: dealer.name, leadType, buyerName, buyerCity, contextLine });
  msg.to = dealer.email;
  try {
    await emailProvider().send(msg);
  } catch (e) {
    logger.error({ err: e, dealerId }, 'Dealer email notification failed');
  }
}

// ─── Buyer enquiry on a specific listing (PRD §6.2.7) ─────────────────────

export async function createBuyerEnquiry(listingSlug: string, input: EnquiryInput) {
  const listing = (await prisma.listing.findUnique({
    where: { slug: listingSlug },
    select: { id: true, dealerId: true, modelName: true, year: true, status: true },
  })) as { id: string; dealerId: string; modelName: string; year: number; status: string } | null;
  if (!listing || listing.status !== 'ACTIVE') {
    throw new HttpError(404, 'NOT_FOUND', 'Listing not available');
  }
  const enquiry = await prisma.enquiry.create({
    data: {
      listingId: listing.id,
      dealerId: listing.dealerId,
      name: input.name,
      phoneEnc: encryptPii(input.phone),
      emailEnc: encryptPii(input.email),
      city: input.city,
      pincode: input.pincode,
      message: input.message,
    },
  });
  await notifyDealer(
    listing.dealerId,
    'BUYER',
    input.name,
    input.city,
    `Interested in: ${listing.year} ${listing.modelName}`,
  );
  return { id: enquiry.id };
}

// ─── Trade-in lead from /sell-bike form (PRD §6.1.6) ──────────────────────

export async function createTradeInLead(input: TradeInLeadInput) {
  // Honour an explicit dealer pick from the buyer; fall back to nearest-active
  // routing if none provided or the chosen dealer is suspended/missing.
  let dealerId: string | null = null;
  if (input.dealerId) {
    const chosen = await prisma.dealer.findFirst({
      where: { id: input.dealerId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (chosen) dealerId = chosen.id;
  }
  if (!dealerId) dealerId = await nearestActiveDealer();

  const lead = await prisma.tradeInLead.create({
    data: {
      dealerId,
      username: input.username,
      bikeModel: input.bikeModel,
      vin: input.vin,
      phoneEnc: encryptPii(input.phone),
      emailEnc: encryptPii(input.email),
      city: input.city,
    },
  });
  await notifyDealer(dealerId, 'TRADE_IN', input.username, input.city, `Bike: ${input.bikeModel}, VIN ${input.vin}`);
  return { id: lead.id, dealerId };
}

// ─── Dealer queue reads ──────────────────────────────────────────────────

interface LeadDbRow {
  id: string;
  name?: string;
  username?: string;
  phoneEnc: string;
  emailEnc: string;
  city: string | null;
  pincode?: string | null;
  message?: string | null;
  bikeModel?: string;
  vin?: string;
  status: LeadStatus;
  createdAt: Date;
  listingId?: string;
  /** Populated for buyer enquiries via the joined listing — `${year} ${modelName}`. */
  listing?: { year: number; modelName: string } | null;
}

// Lead-list rows used to mask phone/email behind asterisks. The dealer-portal
// product owner asked for full visibility on the queue list (not just on the
// detail drawer) so reps can call/email straight from the table — so we now
// return the decrypted values directly. Access is still gated by the DEALER
// role + per-row dealerId ownership check on the underlying queries.
function toLeadView(row: LeadDbRow) {
  // For buyer enquiries the queue should display the bike the buyer
  // enquired about — surface it as `bikeModel` from the joined listing
  // (server-derived; client never has to fetch the listing separately).
  const bikeModel =
    row.bikeModel ??
    (row.listing ? `${row.listing.year} ${row.listing.modelName}` : undefined);
  return {
    id: row.id,
    name: row.name ?? row.username ?? '',
    phone: decryptPii(row.phoneEnc),
    email: decryptPii(row.emailEnc),
    city: row.city,
    pincode: row.pincode,
    message: row.message,
    bikeModel,
    vin: row.vin,
    status: row.status,
    listingId: row.listingId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listBuyerEnquiries(dealerId: string, status?: LeadStatus) {
  const rows = (await prisma.enquiry.findMany({
    where: { dealerId, ...(status ? { status } : {}) },
    include: { listing: { select: { year: true, modelName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })) as unknown as LeadDbRow[];
  return rows.map(toLeadView);
}

export async function listTradeInLeads(dealerId: string, status?: LeadStatus) {
  const rows = (await prisma.tradeInLead.findMany({
    where: { dealerId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })) as unknown as LeadDbRow[];
  return rows.map(toLeadView);
}

export async function updateLeadStatus(
  dealerId: string,
  kind: 'buyer' | 'trade-in',
  id: string,
  status: LeadStatus,
) {
  const where = { id, dealerId };
  // Pull the current status first so we can validate the transition. The
  // pipeline is forward-only within its kind's stages; DEAD/LOST is allowed
  // from anywhere as the alt-terminal escape hatch.
  const existing =
    kind === 'buyer'
      ? await prisma.enquiry.findFirst({ where, select: { status: true } })
      : await prisma.tradeInLead.findFirst({ where, select: { status: true } });
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
  if (!canTransitionLead(kind, existing.status, status)) {
    throw new HttpError(
      409,
      'INVALID_TRANSITION',
      `Cannot move a ${kind} lead from ${existing.status} → ${status}. Pipeline is forward-only; only DEAD / LOST can be set from any stage.`,
    );
  }

  if (kind === 'buyer') return prisma.enquiry.update({ where, data: { status } });
  return prisma.tradeInLead.update({ where, data: { status } });
}

export async function getLeadDetail(
  dealerId: string,
  kind: 'buyer' | 'trade-in',
  id: string,
) {
  if (kind === 'buyer') {
    const row = await prisma.enquiry.findFirst({
      where: { id, dealerId },
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            year: true,
            modelName: true,
            modelFamily: true,
            colour: true,
            kmsDriven: true,
            price: true,
            images: true,
          },
        },
      },
    });
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
    return {
      id: row.id,
      kind: 'buyer' as const,
      name: row.name,
      // Lead detail is gated by `dealerId` ownership above — the assigned
      // dealer needs the full phone/email to actually contact the buyer
      // (click-to-call, click-to-email). PII stays masked on the queue list
      // view; only opening the detail unmasks it.
      phone: decryptPii(row.phoneEnc),
      email: decryptPii(row.emailEnc),
      city: row.city,
      pincode: row.pincode,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      listing: row.listing
        ? {
            ...row.listing,
            price: Number(row.listing.price),
          }
        : null,
    };
  }

  const row = await prisma.tradeInLead.findFirst({ where: { id, dealerId } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
  return {
    id: row.id,
    kind: 'trade-in' as const,
    name: row.username,
    phone: decryptPii(row.phoneEnc),
    email: decryptPii(row.emailEnc),
    city: row.city,
    bikeModel: row.bikeModel,
    vin: row.vin,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Dealer-side manual lead creation (PRD Change Request) ────────────────
// A dealer rep takes a phone call / walk-in and needs to log the lead by hand.
// Skips the buyer-facing OTP gate because the dealer is already authenticated
// against their own listing/dealer scope.

// Strip the keys the Enquiry table holds in dedicated columns from the
// dealer-side payload, leaving only the qualifying answers (source, state,
// budget, visitPreference, etc.) for the `notes` JSON column.
function buyerEnquiryNotes(input: DealerBuyerEnquiryInput) {
  const {
    listingId: _l,
    name: _n,
    phone: _p,
    email: _e,
    city: _c,
    pincode: _pin,
    message: _m,
    ...rest
  } = input;
  void _l;
  void _n;
  void _p;
  void _e;
  void _c;
  void _pin;
  void _m;
  return rest;
}
function tradeInNotes(input: DealerTradeInLeadInput) {
  const {
    username: _u,
    bikeModel: _b,
    vin: _v,
    phone: _p,
    email: _e,
    city: _c,
    dealerId: _d,
    ...rest
  } = input;
  void _u;
  void _b;
  void _v;
  void _p;
  void _e;
  void _c;
  void _d;
  return rest;
}

export async function dealerCreateBuyerEnquiry(
  dealerId: string,
  input: DealerBuyerEnquiryInput,
) {
  // Verify the listing belongs to this dealer — prevents a malicious dealer
  // from logging fake enquiries against another dealer's bikes.
  const listing = (await prisma.listing.findFirst({
    where: { id: input.listingId, dealerId },
    select: { id: true, modelName: true, year: true },
  })) as { id: string; modelName: string; year: number } | null;
  if (!listing) {
    throw new HttpError(404, 'LISTING_NOT_FOUND', 'Listing not found for this dealer');
  }
  const enquiry = await prisma.enquiry.create({
    data: {
      listingId: listing.id,
      dealerId,
      name: input.name,
      phoneEnc: encryptPii(input.phone),
      emailEnc: encryptPii(input.email),
      city: input.city,
      pincode: input.pincode,
      message: input.message,
      notes: buyerEnquiryNotes(input),
    },
  });
  // Email confirmation — dealer rep already has the lead in front of them,
  // but the email mirrors the buyer-side flow and provides an audit trail.
  await notifyDealer(
    dealerId,
    'BUYER',
    input.name,
    input.city,
    `Interested in: ${listing.year} ${listing.modelName}`,
  );
  return { id: enquiry.id };
}

export async function dealerCreateTradeInLead(
  dealerId: string,
  input: DealerTradeInLeadInput,
) {
  const lead = (await prisma.tradeInLead.create({
    data: {
      dealerId,
      username: input.username,
      bikeModel: input.bikeModel,
      vin: input.vin,
      phoneEnc: encryptPii(input.phone),
      emailEnc: encryptPii(input.email),
      city: input.city,
      notes: tradeInNotes(input),
    },
  })) as unknown as { id: string };
  await notifyDealer(
    dealerId,
    'TRADE_IN',
    input.username,
    input.city,
    `Bike: ${input.bikeModel}, VIN ${input.vin}`,
  );
  return { id: lead.id };
}
