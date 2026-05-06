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
export async function audit(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: event.actorId ?? null,
        actorRole: event.actorRole,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata as never,
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  } catch (e) {
    logger.error({ err: e, event }, 'Audit log write failed');
  }
}
