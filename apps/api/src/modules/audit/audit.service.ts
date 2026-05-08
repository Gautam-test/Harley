import { prisma } from '../../config/prisma.js';
import { logger } from '../../config/logger.js';

interface AuditEvent {
  actorId?: string | null;
  actorRole: 'ADMIN' | 'DEALER' | 'SYSTEM';
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

// PRD §9.3 — append-only audit log. Failures are logged but never throw — auditing
// must not block the underlying user action.
//
// AuditLog.actorId has a FK to AdminUser only (legacy schema decision), so a
// dealer cuid passed as actorId would violate `AuditLog_actorId_fkey`. We
// fold the dealer's id into metadata.dealerId and null out actorId for any
// non-admin actor; the canonical actorRole field still records who acted,
// and admin queries can still join through metadata.dealerId. Long-term
// fix is a Prisma migration to drop the FK so actorId can hold either a
// Dealer or AdminUser cuid; that's tracked separately.
export async function audit(event: AuditEvent): Promise<void> {
  try {
    const isAdmin = event.actorRole === 'ADMIN';
    const actorId = isAdmin ? event.actorId ?? null : null;
    const metadata =
      !isAdmin && event.actorId
        ? { ...(event.metadata ?? {}), dealerId: event.actorId }
        : event.metadata;
    await prisma.auditLog.create({
      data: {
        actorId,
        actorRole: event.actorRole,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: metadata as never,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (e) {
    logger.error({ err: e, event }, 'Audit log write failed');
  }
}
