import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { AdminCreateDealerInput, AdminUpdateDealerInput, DealerStatus } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';
import { audit } from '../audit/audit.service.js';
import { validatePincodeMapping } from '../../utils/pincodeValidator.js';

interface AuditCtx {
  actorId: string;
  ip?: string;
  ua?: string;
}

function generatePassword(): string {
  // 16-char URL-safe random; admin should rotate after first login.
  return randomBytes(12).toString('base64url').slice(0, 16);
}

// BUG-051: dealer email + phone are unique at DB + service layer.
// Spec-mandated copy kept in constants — single source of truth, easy
// to tweak wording without hunting through service code.
const DUPLICATE_EMAIL_MESSAGE =
  'This email address is already registered to another dealer.';
const DUPLICATE_PHONE_MESSAGE =
  'This phone number is already registered to another dealer.';
const DUPLICATE_USERNAME_MESSAGE =
  'This username is already taken — please pick another.';

/** Throw a structured 409 the admin Add/Edit Dealer modal renders as
 *  an inline field error. Existing DealersPage onError handler parses
 *  `fieldErrors` out of the message JSON, so wrapping the message in
 *  that envelope lights up the right field automatically. */
function throwFieldTaken(field: 'email' | 'phone' | 'username', message: string): never {
  throw new HttpError(
    409,
    `DEALER_${field.toUpperCase()}_TAKEN`,
    JSON.stringify({ fieldErrors: { [field]: [message] } }),
  );
}
const throwEmailTaken = () => throwFieldTaken('email', DUPLICATE_EMAIL_MESSAGE);
const throwPhoneTaken = () => throwFieldTaken('phone', DUPLICATE_PHONE_MESSAGE);
const throwUsernameTaken = () => throwFieldTaken('username', DUPLICATE_USERNAME_MESSAGE);

export async function adminCreateDealer(input: AdminCreateDealerInput, ctx: AuditCtx) {
  // BUG-051: surface the username clash as an inline field error too,
  // matching the email + phone pattern below. Was previously a generic
  // banner; now the admin sees the red asterisk under the Username
  // input and knows exactly which field to change. Using findFirst for
  // client-regen independence (see email check below).
  const usernameClash = await prisma.dealer.findFirst({ where: { username: input.username } });
  if (usernameClash) throwUsernameTaken();

  // BUG-051: pre-check duplicates so we can return the spec-mandated
  // friendly inline error instead of relying on the Prisma P2002
  // fallback below (which races: a parallel admin could beat us to
  // the DB constraint). Email is normalised to lowercase first.
  //
  // Using findFirst (not findUnique) so the check works even when
  // the deploy skipped `prisma:generate` after the schema change —
  // findFirst doesn't require email to be in WhereUniqueInput, so
  // the pre-check runs correctly against any Prisma client version.
  // Same pattern as the phone check below. Demo proved this matters:
  // even with the @unique annotation in schema.prisma, if the
  // generated client is stale, findUnique({where:{email}}) silently
  // returns null and duplicates slip through.
  const normalisedEmail = input.email.trim().toLowerCase();
  const emailTaken = await prisma.dealer.findFirst({ where: { email: normalisedEmail } });
  if (emailTaken) throwEmailTaken();

  // Phone is already stored in canonical "+91XXXXXXXXXX" form by the
  // zod schema (packages/types/src/common.ts phoneIN). Using findFirst
  // rather than findUnique here so the code compiles against either
  // the pre-migration Prisma client (no phone @unique) or the
  // post-migration one — the index makes the query O(1) either way.
  const phoneTaken = await prisma.dealer.findFirst({ where: { phone: input.phone } });
  if (phoneTaken) throwPhoneTaken();

  // BUG-053: server-side State/City/Pincode mapping check. Frontend
  // already autofills via postalpincode.in and warns on mismatch, but
  // an API caller (curl, script) can bypass that — this is the
  // authoritative gate. Fails open if the lookup network call fails
  // so a momentary blip doesn't stop dealer onboarding.
  const pin = await validatePincodeMapping({
    state: input.state,
    city: input.city,
    pincode: input.pincode,
    requireAll: true,
  });
  if (!pin.valid) {
    throw new HttpError(
      400,
      'PINCODE_MISMATCH',
      JSON.stringify({ fieldErrors: { pincode: [pin.reason ?? 'Invalid pincode.'] } }),
    );
  }

  const password = input.password ?? generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  let dealer;
  try {
    dealer = await prisma.dealer.create({
      data: {
        username: input.username,
        passwordHash,
        name: input.name,
        legalName: input.legalName,
        email: normalisedEmail,
        phone: input.phone,
        address: input.address,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        latitude: input.latitude,
        longitude: input.longitude,
        torqueDealerId: input.torqueDealerId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Unique constraint violation — possible fields: username, email,
      // phone, or torqueDealerId. All four are caught by the pre-checks
      // above, but the P2002 branch handles parallel-admin races where
      // a second admin claims the same field between our findUnique
      // and the insert.
      const field = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      if (field.includes('email')) throwEmailTaken();
      if (field.includes('phone')) throwPhoneTaken();
      if (field.includes('username')) throwUsernameTaken();
      if (field.includes('torqueDealerId')) {
        throw new HttpError(409, 'TORQUE_ID_TAKEN', `Torque Dealer ID "${input.torqueDealerId}" is already assigned to another dealer.`);
      }
      throw new HttpError(409, 'DUPLICATE_FIELD', `A dealer with this ${field} already exists.`);
    }
    throw e;
  }

  await audit({
    actorId: ctx.actorId,
    actorRole: 'ADMIN',
    action: 'DEALER_CREATED',
    entityType: 'Dealer',
    entityId: dealer.id,
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
  });

  // Return one-time password to admin so they can communicate to dealer.
  return { id: dealer.id, username: dealer.username, generatedPassword: input.password ? null : password };
}

export async function adminUpdateDealer(id: string, input: AdminUpdateDealerInput, ctx: AuditCtx) {
  // BUG-051: same duplicate-email protection on the update path —
  // otherwise an admin could rename Dealer-B's email to Dealer-A's
  // address and bypass the unique constraint until the DB rejected it
  // with an opaque P2002. Normalise to lowercase to match create.
  const data: Record<string, unknown> = { ...input };
  if (typeof input.email === 'string') {
    const normalisedEmail = input.email.trim().toLowerCase();
    // findFirst (not findUnique) — see adminCreateDealer for rationale.
    const clash = await prisma.dealer.findFirst({ where: { email: normalisedEmail } });
    if (clash && clash.id !== id) throwEmailTaken();
    data.email = normalisedEmail;
  }
  if (typeof input.phone === 'string') {
    // findFirst (not findUnique) for client-regen-independence — see
    // adminCreateDealer for full rationale.
    const clash = await prisma.dealer.findFirst({ where: { phone: input.phone } });
    if (clash && clash.id !== id) throwPhoneTaken();
  }
  try {
    await prisma.dealer.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = ((e.meta?.target as string[] | undefined) ?? []).join(',');
      if (target.includes('email')) throwEmailTaken();
      if (target.includes('phone')) throwPhoneTaken();
    }
    throw e;
  }
  await audit({
    actorId: ctx.actorId,
    actorRole: 'ADMIN',
    action: 'DEALER_UPDATED',
    entityType: 'Dealer',
    entityId: id,
    metadata: { fields: Object.keys(input) },
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
  });
  return { id };
}

export async function adminSetDealerStatus(id: string, status: DealerStatus, ctx: AuditCtx) {
  const prev = await prisma.dealer.findUniqueOrThrow({ where: { id }, select: { status: true } });
  const dealer = await prisma.dealer.update({ where: { id }, data: { status } });
  // PRD §6.3.3 — Suspended dealers can't log in; their listings auto-deactivate.
  if (status === 'SUSPENDED' || status === 'INACTIVE') {
    await prisma.listing.updateMany({
      where: { dealerId: id, status: 'ACTIVE' },
      data: { status: 'DEACTIVATED' },
    });
  } else if (status === 'ACTIVE' && (prev.status === 'SUSPENDED' || prev.status === 'INACTIVE')) {
    // Restore listings that were auto-deactivated when the dealer was suspended/deactivated.
    await prisma.listing.updateMany({
      where: { dealerId: id, status: 'DEACTIVATED' },
      data: { status: 'ACTIVE' },
    });
  }
  await audit({
    actorId: ctx.actorId,
    actorRole: 'ADMIN',
    action: `DEALER_STATUS_${status}`,
    entityType: 'Dealer',
    entityId: id,
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
  });
  return { id: dealer.id, status: dealer.status };
}

export async function adminResetDealerPassword(id: string, ctx: AuditCtx) {
  const password = generatePassword();
  await prisma.dealer.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
  await audit({
    actorId: ctx.actorId,
    actorRole: 'ADMIN',
    action: 'DEALER_PASSWORD_RESET',
    entityType: 'Dealer',
    entityId: id,
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
  });
  return { id, generatedPassword: password };
}

interface DealerListRow {
  id: string;
  username: string;
  name: string;
  city: string;
  email: string;
  phone: string;
  status: DealerStatus;
  createdAt: Date;
}

export async function adminListDealers(filter?: { status?: DealerStatus; q?: string }) {
  const rows = (await prisma.dealer.findMany({
    where: {
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' as const } },
              { username: { contains: filter.q, mode: 'insensitive' as const } },
              { city: { contains: filter.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      name: true,
      city: true,
      email: true,
      phone: true,
      status: true,
      createdAt: true,
    },
  })) as unknown as DealerListRow[];
  return rows.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }));
}
