import type {
  EnquiryInput,
  GeneralLeadInput,
  TradeInLeadInput,
  LeadStatus,
} from '@hd-cpo/types';
import { canTransitionLead } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';
import { encryptPii, decryptPii, maskEmail, maskPhone } from '../../utils/crypto.js';
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
  leadType: 'GENERAL' | 'BUYER' | 'TRADE_IN',
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

// ─── General lead via info-gate popup (PRD §6.1.4) ────────────────────────
// Routed to nearest active dealer using great-circle distance.

export async function createGeneralLead(
  input: GeneralLeadInput,
  buyerLat?: number,
  buyerLng?: number,
) {
  const dealerId = await nearestActiveDealer(buyerLat, buyerLng);
  const lead = await prisma.generalLead.create({
    data: {
      dealerId,
      name: input.name,
      phoneEnc: encryptPii(input.phone),
      emailEnc: encryptPii(input.email),
      city: input.city,
      pincode: input.pincode,
      modelInterest: input.modelInterest,
      priceRange: input.priceRange,
    },
  });
  await notifyDealer(dealerId, 'GENERAL', input.name, input.city, input.modelInterest ?? undefined);
  return { id: lead.id, dealerId };
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
  modelInterest?: string | null;
  priceRange?: string | null;
  bikeModel?: string;
  vin?: string;
  status: LeadStatus;
  createdAt: Date;
  listingId?: string;
}

function toLeadView(row: LeadDbRow) {
  return {
    id: row.id,
    name: row.name ?? row.username ?? '',
    phone: maskPhone(decryptPii(row.phoneEnc)),
    email: maskEmail(decryptPii(row.emailEnc)),
    city: row.city,
    pincode: row.pincode,
    message: row.message,
    modelInterest: row.modelInterest,
    priceRange: row.priceRange,
    bikeModel: row.bikeModel,
    vin: row.vin,
    status: row.status,
    listingId: row.listingId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listGeneralLeads(dealerId: string, status?: LeadStatus) {
  const rows = (await prisma.generalLead.findMany({
    where: { dealerId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })) as unknown as LeadDbRow[];
  return rows.map(toLeadView);
}

export async function listBuyerEnquiries(dealerId: string, status?: LeadStatus) {
  const rows = (await prisma.enquiry.findMany({
    where: { dealerId, ...(status ? { status } : {}) },
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
  kind: 'general' | 'buyer' | 'trade-in',
  id: string,
  status: LeadStatus,
) {
  const where = { id, dealerId };
  // Pull the current status first so we can validate the transition. The
  // pipeline is forward-only within its kind's stages; DEAD/LOST is allowed
  // from anywhere as the alt-terminal escape hatch.
  const existing =
    kind === 'general'
      ? await prisma.generalLead.findFirst({ where, select: { status: true } })
      : kind === 'buyer'
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

  if (kind === 'general') return prisma.generalLead.update({ where, data: { status } });
  if (kind === 'buyer') return prisma.enquiry.update({ where, data: { status } });
  return prisma.tradeInLead.update({ where, data: { status } });
}

export async function getLeadDetail(
  dealerId: string,
  kind: 'general' | 'buyer' | 'trade-in',
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

  if (kind === 'general') {
    const row = await prisma.generalLead.findFirst({ where: { id, dealerId } });
    if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
    return {
      id: row.id,
      kind: 'general' as const,
      name: row.name,
      // Lead detail is gated by `dealerId` ownership above — the assigned
      // dealer needs the full phone/email to actually contact the buyer
      // (click-to-call, click-to-email). PII stays masked on the queue list
      // view; only opening the detail unmasks it.
      phone: decryptPii(row.phoneEnc),
      email: decryptPii(row.emailEnc),
      city: row.city,
      pincode: row.pincode,
      modelInterest: row.modelInterest,
      priceRange: row.priceRange,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  const row = await prisma.tradeInLead.findFirst({ where: { id, dealerId } });
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Lead not found');
  return {
    id: row.id,
    kind: 'trade-in' as const,
    name: row.username,
    phone: maskPhone(decryptPii(row.phoneEnc)),
    email: maskEmail(decryptPii(row.emailEnc)),
    city: row.city,
    bikeModel: row.bikeModel,
    vin: row.vin,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
