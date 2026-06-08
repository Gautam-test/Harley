import type {
  EnquiryInput,
  TradeInLeadInput,
  DealerBuyerEnquiryInput,
  DealerTradeInLeadInput,
  LeadStatus,
} from '@hd-cpo/types';
import { canTransitionLead } from '@hd-cpo/types';
import { createHash } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { encryptPii, decryptPii } from '../../utils/crypto.js';
import { HttpError } from '../../middleware/error-handler.js';
import {
  dealerLeadEmail,
  emailProvider,
  buyerEnquiryConfirmationEmail,
  sellerTradeInConfirmationEmail,
  buyerDealerUpdateEmail,
} from '../email/email.module.js';
import { nearestActiveDealer } from '../dealers/dealer-routing.js';
import { formatLeadId } from '../../utils/leadId.js';

interface DealerForEmail {
  id: string;
  name: string;
  email: string;
}

// ── Buyer/seller confirmation email idempotency ───────────────────────
// Audit-pass fix: dealer-create paths can fire the buyer confirmation
// email twice if the dealer accidentally double-submits or logs two
// near-identical enquiries (same email + same listing / VIN). The
// public submit paths are guarded by VIN gates, but the dealer side
// doesn't share that protection — so we cap it at the email layer
// using a short-TTL Redis key. First send wins; duplicates within
// the window drop silently. Hashed to keep PII out of Redis keys.
const CONFIRMATION_DEDUPE_TTL_SECONDS = 5 * 60;
function confirmationDedupeKey(scope: 'buyer' | 'seller', email: string, ref: string) {
  const norm = `${email.trim().toLowerCase()}|${ref.trim().toLowerCase()}`;
  const h = createHash('sha256').update(norm).digest('hex').slice(0, 24);
  return `lead:confirm-sent:${scope}:${h}`;
}
async function shouldSendConfirmation(
  scope: 'buyer' | 'seller',
  email: string,
  ref: string,
): Promise<boolean> {
  const key = confirmationDedupeKey(scope, email, ref);
  // Redis `SET key NX EX 300` — atomic "claim or no-op". Returns 'OK'
  // on first claim, null when the key already exists. We don't care
  // about the exact failure mode — anything other than 'OK' means
  // "someone else just sent the same email, skip".
  const claimed = await redis.set(key, '1', 'EX', CONFIRMATION_DEDUPE_TTL_SECONDS, 'NX');
  if (!claimed) {
    logger.info({ scope, key }, 'lead: confirmation email deduped (5-min window)');
    return false;
  }
  return true;
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
  /** Formatted lead ref (B-/S-YYYY-XXXX) to surface in the email so the
   *  rep can correlate it with the row in their portal. */
  referenceId?: string,
): Promise<boolean> {
  const dealer = (await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, name: true, email: true },
  })) as DealerForEmail | null;
  if (!dealer) {
    logger.error({ dealerId }, 'Dealer email notification skipped — dealer not found');
    return false;
  }
  const msg = dealerLeadEmail({ dealerName: dealer.name, leadType, buyerName, buyerCity, contextLine, referenceId });
  msg.to = dealer.email;
  try {
    await emailProvider().send(msg);
    return true;
  } catch (e) {
    logger.error({ err: e, dealerId }, 'Dealer email notification failed');
    return false;
  }
}

// Fire-and-forget buyer / seller email. Never throws — a mail failure
// must not fail the lead create/update that triggered it. Callers `void`
// this. Logs both the attempt and the outcome so a QA pass that "didn't
// receive the email" can be diagnosed in pm2 logs without guessing.
async function sendBuyerEmail(
  to: string,
  msg: { subject: string; html: string; text?: string },
): Promise<void> {
  if (!to) {
    logger.warn('Buyer/seller email skipped — empty recipient address');
    return;
  }
  logger.info({ to, subject: msg.subject }, 'Buyer/seller email — attempting send');
  try {
    await emailProvider().send({ to, subject: msg.subject, html: msg.html, text: msg.text });
    logger.info({ to, subject: msg.subject }, 'Buyer/seller email — send completed');
  } catch (e) {
    logger.error({ err: e, to }, 'Buyer/seller email — send failed');
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
export async function checkTradeInVinGate(
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
  // Duplicate-enquiry gate per QA spec:
  //   Duplicate = same VIN/listing + same mobile + NON-terminal status
  // Once the dealer moves the lead to any terminal status (DEAD / LOST /
  // CLOSED / SUCCESS / CONVERTED / TRADE_IN_FINALIZED — see
  // TERMINAL_LEAD_STATUSES above), the gate clears and the buyer can
  // submit a fresh enquiry on the same bike. Different bikes and
  // different mobiles are always allowed. Notifications + audit only
  // fire on the create path below, so a 409 here keeps SMS / email /
  // dealer push from being triggered twice.
  const existing = await findOpenBuyerEnquiryForPhone(listing.id, input.phone);
  if (existing) {
    throw new HttpError(
      409,
      'ENQUIRY_ALREADY_OPEN',
      'You already have an active enquiry for this motorcycle. Our dealer team will contact you shortly.',
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
    formatLeadId('buyer', enquiry.id, enquiry.createdAt),
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
      // QA: send the same formatted ref the buyer just saw on the
      // success modal (B-YYYY-XXXX) so the email matches the on-screen
      // confirmation. The /leads/track API accepts this format directly.
      referenceId: formatLeadId('buyer', enquiry.id, enquiry.createdAt),
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
  const ok = await notifyDealer(
    dealerId,
    'TRADE_IN',
    input.username,
    input.city,
    `Bike: ${input.bikeModel}, VIN ${input.vin}`,
    formatLeadId('trade-in', lead.id, lead.createdAt),
  );
  if (!ok) await flagNotificationFailed('tradeInLead', lead.id, 'send_failed');
  // Seller confirmation email — same trigger family as the buyer enquiry
  // confirmation (customer submits an enquiry form → confirmation).
  void sendBuyerEmail(
    input.email,
    buyerEnquiryConfirmationEmail({
      buyerName: input.username,
      bikeLabel: input.bikeModel,
      // S- prefix for trade-in leads — same formatter the customer + dealer
      // portals use everywhere a lead reference appears.
      referenceId: formatLeadId('trade-in', lead.id, lead.createdAt),
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

  // QA: when a lead is marked Not Interested (DEAD/LOST), snapshot the
  // prior pipeline stage in notes.frozenStatus so the detail page's
  // pipeline UI can keep the historical progress visually highlighted
  // (instead of going fully grey).
  const isMovingToTerminal = status === 'DEAD' || status === 'LOST';
  const dataPatch: Record<string, unknown> = { status };
  if (isMovingToTerminal) {
    const row =
      kind === 'buyer'
        ? await prisma.enquiry.findFirst({ where, select: { notes: true } })
        : await prisma.tradeInLead.findFirst({ where, select: { notes: true } });
    const prevNotes = (row?.notes as Record<string, unknown> | null) ?? {};
    dataPatch.notes = { ...prevNotes, frozenStatus: existing.status };
  }

  if (kind === 'buyer') {
    await prisma.enquiry.update({ where, data: dataPatch });
  } else {
    await prisma.tradeInLead.update({ where, data: dataPatch });
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
    // QA: surface the full customer-submitted payload. Most extra
    // qualifying answers (source, state, budget, financingNeeded,
    // tradeInInterest, visitPreference, bestTimeToCall, lookingFor)
    // live in the `notes` JSON because the Enquiry table only has
    // dedicated columns for the common fields. The dealer + admin
    // detail pages render these in a "Customer Details" section so
    // reps see the full picture without diving into raw JSON.
    const notes = (row.notes as Record<string, unknown> | null) ?? {};
    const pick = (k: string) =>
      typeof notes[k] === 'string' || typeof notes[k] === 'number' || typeof notes[k] === 'boolean'
        ? (notes[k] as string | number | boolean)
        : null;
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
      // Last pipeline stage before the lead was marked Not Interested.
      // Used by the dealer detail page to keep the historical progress
      // highlighted on the pipeline bar instead of showing all stages grey.
      frozenStatus:
        (row.notes as Record<string, unknown> | null)?.frozenStatus ?? null,
      createdAt: row.createdAt.toISOString(),
      // Customer-side qualifying answers from notes JSON. All nullable so
      // older rows that don't carry them just render "—" client-side.
      state: pick('state'),
      source: pick('source'),
      budget: pick('budget'),
      financingNeeded: pick('financingNeeded'),
      tradeInInterest: pick('tradeInInterest'),
      visitPreference: pick('visitPreference'),
      bestTimeToCall: pick('bestTimeToCall'),
      lookingFor: pick('lookingFor'),
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
  // QA: surface the full seller-side submission. Trade-in keeps
  // bike-condition details (year, KMs, owners, colour, asking price,
  // RC available, service history, insurance valid until, loan
  // outstanding, modifications, reason for selling) inside the notes
  // JSON. Mileage (km/l) is round-tripped via a "Mileage: NN km/l — "
  // prefix on the freeform message — peel it off here so the detail
  // page can show it as its own field.
  const notes = (row.notes as Record<string, unknown> | null) ?? {};
  const pick = (k: string) =>
    typeof notes[k] === 'string' || typeof notes[k] === 'number' || typeof notes[k] === 'boolean'
      ? (notes[k] as string | number | boolean)
      : null;
  const message = (pick('message') as string | null) ?? null;
  const mileageMatch = typeof message === 'string'
    ? message.match(/^Mileage:\s*(\d{1,3}(?:\.\d{1,2})?)\s*km\/l(?:\s*—\s*|\s*$)/)
    : null;
  const mileage = mileageMatch ? mileageMatch[1] : null;
  const cleanMessage = mileageMatch && message
    ? message.slice(mileageMatch[0].length)
    : message;
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
    frozenStatus:
      (row.notes as Record<string, unknown> | null)?.frozenStatus ?? null,
    createdAt: row.createdAt.toISOString(),
    // Trade-in / seller customer details from notes JSON.
    state: pick('state'),
    pincode: pick('pincode'),
    source: pick('source'),
    year: pick('year'),
    kmsDriven: pick('kmsDriven'),
    owners: pick('owners'),
    colour: pick('colour'),
    askingPrice: pick('askingPrice'),
    bestTimeToCall: pick('bestTimeToCall'),
    rcAvailable: pick('rcAvailable'),
    serviceHistoryAvailable: pick('serviceHistoryAvailable'),
    insuranceValidUntil: pick('insuranceValidUntil'),
    loanOutstanding: pick('loanOutstanding'),
    modifications: pick('modifications'),
    reasonForSelling: pick('reasonForSelling'),
    mileage,
    message: cleanMessage,
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
  // Same duplicate-enquiry gate as the customer-portal path. The dealer
  // rep cannot create a parallel ghost lead while a non-terminal lead
  // exists for the same listing + phone. Cleared once the previous lead
  // is moved to a terminal status (Not Interested / Closed / Success /
  // Converted / Lost / Trade-in finalized).
  const existing = await findOpenBuyerEnquiryForPhone(listing.id, input.phone);
  if (existing) {
    throw new HttpError(
      409,
      'ENQUIRY_ALREADY_OPEN',
      // QA: identical wording to the public buyer-flow gate so the buyer
      // sees the same explanation regardless of which path (dealer
      // logging on their behalf vs. buyer submitting themselves) hit
      // the duplicate.
      'You already have an active enquiry for this motorcycle. Our dealer team will contact you shortly.',
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
  // BUG-034: notify BOTH parties on dealer-logged enquiry —
  //   (1) the dealer rep (audit trail + same email customer-portal flow
  //       already sends, so reps see a uniform inbox)
  //   (2) the buyer email captured on the form — so the buyer has a
  //       reference ID + knows the dealer will reach out, even though
  //       they didn't fill the form themselves on the public site.
  const refId = formatLeadId('buyer', enquiry.id, enquiry.createdAt);
  const bikeLabel = `${listing.year} ${listing.modelName}`;
  const ok = await notifyDealer(
    dealerId,
    'BUYER',
    input.name,
    input.city,
    `Interested in: ${bikeLabel}`,
    refId,
  );
  if (!ok) await flagNotificationFailed('enquiry', enquiry.id, 'send_failed');
  // BUG-049: dropped the IIFE+dedupe wrapper that was masking failures
  // on demo (QA reported buyer/seller emails never arriving even though
  // dealer emails worked). The IIFE silently swallowed any throw from
  // the Redis dedupe call, so a single Redis hiccup → no email + no log
  // entry. Direct fire-and-forget mirrors the long-working notifyDealer
  // pattern and sendBuyerEmail catches + logs every outcome (see its
  // body for the attempt/complete/fail log lines).
  void sendBuyerEmail(
    input.email,
    buyerEnquiryConfirmationEmail({
      buyerName: input.name,
      bikeLabel,
      referenceId: refId,
    }),
  );
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
  })) as unknown as { id: string; createdAt: Date };
  // BUG-034: notify BOTH parties on dealer-logged trade-in lead.
  // Seller gets a reference ID + reassurance that a dealer is on it.
  const refId = formatLeadId('trade-in', lead.id, lead.createdAt);
  const ok = await notifyDealer(
    dealerId,
    'TRADE_IN',
    input.username,
    input.city,
    `Bike: ${input.bikeModel}, VIN ${input.vin}`,
    refId,
  );
  if (!ok) await flagNotificationFailed('tradeInLead', lead.id, 'send_failed');
  // BUG-049: dropped the IIFE+dedupe wrapper — see dealerCreateBuyerEnquiry
  // for the full rationale. Direct fire-and-forget; sendBuyerEmail logs
  // every attempt + outcome to pm2 logs.
  void sendBuyerEmail(
    input.email,
    sellerTradeInConfirmationEmail({
      sellerName: input.username,
      bikeLabel: input.bikeModel,
      vin: input.vin,
      referenceId: refId,
    }),
  );
  return { id: lead.id };
}
