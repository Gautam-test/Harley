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

export async function adminCreateDealer(input: AdminCreateDealerInput, ctx: AuditCtx) {
  const existing = await prisma.dealer.findUnique({ where: { username: input.username } });
  if (existing) throw new HttpError(409, 'USERNAME_TAKEN', 'Username already in use');

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
        email: input.email,
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
      // Unique constraint violation — torqueDealerId already in use
      const field = (e.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
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
  await prisma.dealer.update({ where: { id }, data: input });
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
