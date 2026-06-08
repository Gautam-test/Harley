import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { AdminCreateDealerInput, AdminUpdateDealerInput, DealerStatus } from '@hd-cpo/types';
import { prisma } from '../../config/prisma.js';
import { HttpError } from '../../middleware/error-handler.js';
import { audit } from '../audit/audit.service.js';

interface AuditCtx {
  actorId: string;
  ip?: string;
  ua?: string;
}

function generatePassword(): string {
  // 16-char URL-safe random; admin should rotate after first login.
  return randomBytes(12).toString('base64url').slice(0, 16);
}

// BUG-051: dealer email is unique at DB + service layer. Spec-mandated
// copy for the duplicate-email error — kept in one constant so the
// frontend can string-match if it ever wants to, and so the wording is
// trivially editable in one place.
const DUPLICATE_EMAIL_MESSAGE =
  'This email address is already registered to another dealer.';

/** Helper: throw a structured 409 the admin Add Dealer modal renders as
 *  an inline field error under the Email input. Existing DealersPage
 *  onError handler parses `fieldErrors` out of the message JSON, so
 *  wrapping the message in that envelope lights up the right field. */
function throwEmailTaken(): never {
  throw new HttpError(
    409,
    'DEALER_EMAIL_TAKEN',
    JSON.stringify({ fieldErrors: { email: [DUPLICATE_EMAIL_MESSAGE] } }),
  );
}

export async function adminCreateDealer(input: AdminCreateDealerInput, ctx: AuditCtx) {
  const existing = await prisma.dealer.findUnique({ where: { username: input.username } });
  if (existing) throw new HttpError(409, 'USERNAME_TAKEN', 'Username already in use');

  // BUG-051: pre-check for duplicate email so we can return the
  // spec-mandated friendly inline error instead of relying on the
  // Prisma P2002 fallback below (which races: a parallel admin could
  // beat us to the constraint). Normalise to lowercase first because
  // the DB constraint operates on the stored value, and we normalise
  // on every write to keep that comparison case-insensitive in practice.
  const normalisedEmail = input.email.trim().toLowerCase();
  const emailTaken = await prisma.dealer.findUnique({ where: { email: normalisedEmail } });
  if (emailTaken) throwEmailTaken();

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
      // Unique constraint violation — possible fields: torqueDealerId,
      // username (caught above but kept here defensively), or email
      // (race with another admin between our pre-check and the insert).
      const field = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      if (field.includes('email')) {
        throwEmailTaken();
      }
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
    const clash = await prisma.dealer.findUnique({ where: { email: normalisedEmail } });
    if (clash && clash.id !== id) throwEmailTaken();
    data.email = normalisedEmail;
  }
  try {
    await prisma.dealer.update({ where: { id }, data });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2002' &&
      ((e.meta?.target as string[] | undefined) ?? []).join(',').includes('email')
    ) {
      throwEmailTaken();
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
  const dealer = await prisma.dealer.update({ where: { id }, data: { status } });
  // PRD §6.3.3 — Suspended dealers can't log in; their listings auto-deactivate.
  if (status === 'SUSPENDED' || status === 'INACTIVE') {
    await prisma.listing.updateMany({
      where: { dealerId: id, status: 'ACTIVE' },
      data: { status: 'DEACTIVATED' },
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
