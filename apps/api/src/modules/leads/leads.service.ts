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
import {
  dealerLeadEmail,
  emailProvider,
  buyerEnquiryConfirmationEmail,
  buyerDealerUpdateEmail,
} from '../email/email.module.js';
import { nearestActiveDealer } from '../dealers/dealer-routing.js';

interface DealerForEmail {
  id: string;
  name: string;
  email: string;
}

// Returns true if the dealer email was sent successfully. Callers should
// flag the underlying lead row when this returns false so the dealer
// dashboard can surface "we couldn't reach you about this lead".
async function notifyDealer(
  dealerId: string,
  leadType: 'BUYER' | 'TRADE_IN',
  buyerName: string,
  buyerCity?: string,
  contextLine?: string,
): Promise<boolean> {
  const dealer = (await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, name: true, email: true },
  })) as DealerForEmail | null;
  if (!dealer) {
    logger.error({ dealerId }, 'Dealer email notification skipped — dealer not found');
    return false;
  }
  const msg = dealerLeadEmail({ dealerName: dealer.name, leadType, buyerName, buyerCity, contextLine });
  msg.to = dealer.email;
  try {
    await emailProvider().send(msg);
    return true;
  } catch (e) {
    logger.error({ err: e, dealerId }, 'Dealer email notification failed');
    return false;
  }
}

// Fire-and-forget buyer email. Never throws — a mail failure must not
// fail the lead create/update that triggered it. Callers `void` this.
async function sendBuyerEmail(
  to: string,
  msg: { subject: string; html: string; text?: string },
): Promise<void> {
  if (!to) return;
  try {
    await emailProvider().send({ to, subject: msg.subject, html: msg.html, text: msg.text });
  } catch (e) {
    logger.error({ err: e, to }, 'Buyer email notification failed');
  }
}

// Stamp `notificationFailed: true` on a lead row when the dealer-email
// notification couldn't be sent. The dealer queue read code can then surface
// a small "rep wasn't emailed" badge so reps know which leads slipped past
// their inbox. Best-effort; a follow-up failure here only logs.
async function flagNotificationFailed(
  table: 'enquiry' | 'tradeInLead',
  id: string,
  reason: 'send_failed' | 'dealer_missing',
): Promise<void> {
  try {
    if (table === 'enquiry') {
      await prisma.enquiry.update({
        where: { id },
        data: {
          notes: {
            notificationFailed: true,
            notificationFailReason: reason,
            notificationFailedAt: new Date().toISOString(),
          },
        },
      });
    } else {
      await prisma.tradeInLead.update({
        where: { id },
        data: {
          notes: {
            notificationFailed: true,
            notificationFailReason: reason,
            notificationFailedAt: new Date().toISOString(),
          },
        },
      });
    }
  } catch (e) {
    logger.error({ err: e, table, id }, 'Could not stamp notification-failure flag on lead');
  }
}

// ─── Duplicate-by-mobile dedup helpers ────────────────────────────────────
//
// Phones are stored AES-GCM with a per-record random IV, so the database
// can't filter by ciphertext directly. We pull every non-terminal lead
// (typically a few hundred rows per dealer at most) and decrypt-and-
// compare in memory. The same approach the public /my-status endpoint
// uses — keeps the contract identical between "is the buyer allowed to
// enquire?" and "should the create call accept this submit?".
//
// "Terminal" = the dealer has closed this lead — the buyer may re-enquire.
//
// DEAD / LOST  — dealer marked "Not Interested" (the primary closing action
//                available from every stage as an alt-terminal escape hatch).
// CLOSED       — "Booking Closed" (dealer moved lead to final buyer pipeline
//                stage, booking is confirmed; the enquiry is definitively done).
// SUCCESS      — "Delivered" (bike handed over, lead fully completed).
// CONVERTED    — legacy terminal used before the 6-stage buyer pipeline; kept
//                so historical rows still release the gate.
// TRADE_IN_FINALIZED — terminal stage of the seller/trade-in pipeline.
//
// Bug fixed: previously only DEAD/LOST were listed, so a lead marked
// CLOSED, SUCCESS, or TRADE_IN_FINALIZED still blocked the buyer from
// submitting a fresh enquiry even though the dealer had definitively
// finished it. The user requirement "buyer cannot re-enquire until dealer
// marks it closed" now works correctly across every closing action.
const TERMINAL_LEAD_STATUSES = [
  'DEAD',
  'LOST',
  'CLOSED',
  'SUCCESS',
  'CONVERTED',
  'TRADE_IN_FINALIZED',
] as const;

async function findOpenBuyerEnquiryForPhone(
  listingId: string,
  phone: string,
): Promise<{ id: string } | null> {
  const rows = (await prisma.enquiry.findMany({
    where: {
      listingId,
      status: { notIn: [...TERMINAL_LEAD_STATUSES] },
    },
    select: { id: true, phoneEnc: true },
  })) as Array<{ id: string; phoneEnc: string }>;
  for (const r of rows) {
    try {
      if (decryptPii(r.phoneEnc) === phone) return { id: r.id };
    } catch {
      // PII decrypt failed — wrong key or corrupted ciphertext. Treat
      // as "not a match" rather than aborting the whole check.
    }
  }
  return null;
}

// VIN-based duplicate gate for seller / trade-in leads.
//
// Rules (from PRD requirement):
//
//   1. OPEN LEAD EXISTS for this VIN → always blocked, regardless of phone.
//      A seller cannot raise a second enquiry for the same bike while the
//      first lead is still being worked by the dealer.
//
//   2. LEAD IS CLOSED (terminal) but VIN is still listed on the marketplace
//      in a non-sold status (ACTIVE / DRAFT / DEACTIVATED) → still blocked.
//      The bike hasn't been sold yet, so a duplicate enquiry would create a
//      ghost lead for stock that is already in-flight.
//
//   3. LEAD IS CLOSED and VIN is SOLD or REMOVED from platform (or never
//      listed at all) → allowed. The previous deal is fully done; the seller
//      may enquire again (e.g. they've acquired the bike back, or the
//      platform listed a different unit with the same VIN after a re-list).
//
// Returns a reason string when blocked, null when allowed.
async function checkTradeInVinGate(
  vin: string,
): Promise<'OPEN_LEAD' | 'VIN_STILL_LISTED' | null> {
  // Step 1: any open (non-terminal) lead for this VIN?
  const openLead = (await prisma.tradeInLead.findFirst({
    where: { vin, status: { notIn: [...TERMINAL_LEAD_STATUSES] } },
    select: { id: true },
  })) as { id: string } | null;
  if (openLead) return 'OPEN_LEAD';

  // Step 2: VIN had a lead that is now closed — is the bike still listed
  // on the platform in a non-sold status?
  const closedLeadExists = (await prisma.tradeInLead.findFirst({
    where: { vin, status: { in: [...TERMINAL_LEAD_STATUSES] } },
    select: { id: true },
  })) as { id: string } | null;

  if (closedLeadExists) {
    // Check if listing for this VIN is still live / pending / deactivated
    // (i.e. not SOLD / REMOVED). We match on the root VIN so retired-prefix
    // rows (deactivated:cmid:VIN) don't interfere.
    const activeOnPlatform = (await prisma.listing.findFirst({
      where: {
        vin: { endsWith: vin },
        status: { in: ['ACTIVE', 'DRAFT', 'DEACTIVATED'] },
      },
      select: { id: true },
    })) as { id: true } | null;
    if (activeOnPlatform) return 'VIN_STILL_LISTED';
  }

  return null; // allowed
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
  // Duplicate-by-mobile gate: customer can't open a second enquiry on
  // the same listing while a previous one is still open. The dealer
  // marking the lead Not Interested (DEAD / LOST today, NOT_INTERESTED
  // once buyer-pipeline-v2 merges) clears this gate. Mirrors the
  // pre-check in /listings/:slug/my-status so client and server agree.
  const existing = await findOpenBuyerEnquiryForPhone(listing.id, input.phone);
  if (existing) {
    throw new HttpError(
      409,
      'ENQUIRY_ALREADY_OPEN',
      'Enquiry form already filled with this number. The dealer will be in touch — you can submit a fresh enquiry once they close this one out.',
    );
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
  const ok = await notifyDealer(
    listing.dealerId,
    'BUYER',
    input.name,
    input.city,
    `Interested in: ${listing.year} ${listing.modelName}`,
  );
  if (!ok) await flagNotificationFailed('enquiry', enquiry.id, 'send_failed');
  // Buyer confirmation email (trigger: buyer enquiry submission). The
  // buyer's plaintext email is in scope here at create time. Fire-and-
  // forget so a mail failure never fails the enquiry submit.
  void sendBuyerEmail(
    input.email,
    buyerEnquiryConfirmationEmail({
      buyerName: input.name,
      bikeLabel: `${listing.year} ${listing.modelName}`,
      referenceId: enquiry.id,
    }),
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

  // VIN-based duplicate gate (replaces the old phone-based global check).
  // A seller cannot raise a second enquiry for the same bike until:
  //   a) the previous lead is closed by the dealer, AND
  //   b) the bike is SOLD / REMOVED from the platform (not just listed).
  const vinBlock = await checkTradeInVinGate(input.vin);
  if (vinBlock === 'OPEN_LEAD') {
    throw new HttpError(
      409,
      'SELLER_ENQUIRY_ALREADY_OPEN',
      'An enquiry for this bike is already open. The dealer will be in touch — you can submit a fresh enquiry once they close this one.',
    );
  }
  if (vinBlock === 'VIN_STILL_LISTED') {
    throw new HttpError(
      409,
      'SELLER_VIN_STILL_LISTED',
      'This bike already has a closed enquiry and is still listed on the platform. A new enquiry can only be raised once the bike is marked Sold or Removed.',
    );
  }
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
  const ok = await notifyDealer(dealerId, 'TRADE_IN', input.username, input.city, `Bike: ${input.bikeModel}, VIN ${input.vin}`);
  if (!ok) await flagNotificationFailed('tradeInLead', lead.id, 'send_failed');
  // Seller confirmation email — same trigger family as the buyer enquiry
  // confirmation (customer submits an enquiry form → confirmation).
  void sendBuyerEmail(
    input.email,
    buyerEnquiryConfirmationEmail({
      buyerName: input.username,
      bikeLabel: input.bikeModel,
      referenceId: lead.id,
    }),
  );
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
  /** JSON column on Enquiry / TradeInLead — currently used for dealer-side
      qualification answers + the notificationFailed flag. */
  notes?: { notificationFailed?: boolean } | null;
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
    /** True when the dealer-notification email couldn't be sent. The
        dealer/admin queue surfaces a small badge so reps know to follow up
        manually instead of expecting an email. */
    notificationFailed: row.notes?.notificationFailed === true,
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
      `${status} isn't a valid stage for a ${kind} lead. Pick one of the stages on the ${kind} pipeline (or Dead / Lost as alt-terminals).`,
    );
  }

  // No-op moves don't generate a new audit row — return the previous
  // status with `changed: false` so the route handler can skip the audit.
  if (existing.status === status) {
    return { fromStatus: existing.status, toStatus: status, changed: false };
  }

  if (kind === 'buyer') {
    await prisma.enquiry.update({ where, data: { status } });
  } else {
    await prisma.tradeInLead.update({ where, data: { status } });
  }

  // Buyer dealer-response notification (trigger: dealer updates the lead
  // status). Email the customer that their enquiry moved forward. Fire-
  // and-forget — a mail failure never fails the status update. Recipient
  // email + bike label are fetched fresh; emailEnc is decrypted here.
  void (async () => {
    try {
      if (kind === 'buyer') {
        const row = await prisma.enquiry.findFirst({
          where,
          select: {
            name: true,
            emailEnc: true,
            listing: { select: { year: true, modelName: true } },
          },
        });
        if (row) {
          await sendBuyerEmail(
            decryptPii(row.emailEnc),
            buyerDealerUpdateEmail({
              buyerName: row.name ?? 'there',
              bikeLabel: row.listing
                ? `${row.listing.year} ${row.listing.modelName}`
                : 'your enquiry',
              updateText: `Status updated to "${status}".`,
            }),
          );
        }
      } else {
        const row = await prisma.tradeInLead.findFirst({
          where,
          select: { username: true, emailEnc: true, bikeModel: true },
        });
        if (row) {
          await sendBuyerEmail(
            decryptPii(row.emailEnc),
            buyerDealerUpdateEmail({
              buyerName: row.username ?? 'there',
              bikeLabel: row.bikeModel ?? 'your trade-in',
              updateText: `Status updated to "${status}".`,
            }),
          );
        }
      }
    } catch (e) {
      logger.error({ err: e, id, kind }, 'Buyer status-update email failed');
    }
  })();

  return { fromStatus: existing.status as LeadStatus, toStatus: status, changed: true };
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
  // Verify the listing belongs to this dealer AND is in a state where logging
  // a buyer enquiry makes sense — prevents fake leads against SOLD/REMOVED
  // bikes (which would pollute funnel metrics) and another dealer's stock.
  const listing = (await prisma.listing.findFirst({
    where: {
      id: input.listingId,
      dealerId,
      status: { in: ['ACTIVE', 'DRAFT', 'DEACTIVATED'] },
    },
    select: { id: true, modelName: true, year: true, status: true },
  })) as { id: string; modelName: string; year: number; status: string } | null;
  if (!listing) {
    throw new HttpError(
      404,
      'LISTING_NOT_FOUND',
      'Listing not found for this dealer, or already sold / removed',
    );
  }
  // Same duplicate-by-mobile gate as the customer-portal path: if a
  // previous enquiry on this listing for the same phone is still open,
  // surface a clear 409 so the dealer rep doesn't accidentally create
  // a parallel ghost lead. Cleared once the previous lead is marked
  // Not Interested.
  const existing = await findOpenBuyerEnquiryForPhone(listing.id, input.phone);
  if (existing) {
    throw new HttpError(
      409,
      'ENQUIRY_ALREADY_OPEN',
      'Enquiry form already filled with this number. Continue working the existing lead, or mark it Not Interested to log a fresh one.',
    );
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
  const ok = await notifyDealer(
    dealerId,
    'BUYER',
    input.name,
    input.city,
    `Interested in: ${listing.year} ${listing.modelName}`,
  );
  if (!ok) await flagNotificationFailed('enquiry', enquiry.id, 'send_failed');
  return { id: enquiry.id };
}

export async function dealerCreateTradeInLead(
  dealerId: string,
  input: DealerTradeInLeadInput,
) {
  // VIN-based duplicate gate — same rules as the customer-portal path.
  // Dealer logging on behalf of seller cannot create a second lead for
  // the same bike until: (a) previous lead is closed AND (b) bike is
  // SOLD / REMOVED from the platform.
  const vinBlock = await checkTradeInVinGate(input.vin);
  if (vinBlock === 'OPEN_LEAD') {
    throw new HttpError(
      409,
      'SELLER_ENQUIRY_ALREADY_OPEN',
      'An enquiry for this bike is already open. Continue working the existing lead, or mark it closed to log a fresh one.',
    );
  }
  if (vinBlock === 'VIN_STILL_LISTED') {
    throw new HttpError(
      409,
      'SELLER_VIN_STILL_LISTED',
      'This bike already has a closed enquiry and is still listed on the platform. A new enquiry can only be raised once the bike is marked Sold or Removed.',
    );
  }
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
  const ok = await notifyDealer(
    dealerId,
    'TRADE_IN',
    input.username,
    input.city,
    `Bike: ${input.bikeModel}, VIN ${input.vin}`,
  );
  if (!ok) await flagNotificationFailed('tradeInLead', lead.id, 'send_failed');
  return { id: lead.id };
}
