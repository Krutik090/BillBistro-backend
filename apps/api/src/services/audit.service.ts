import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/client';
import { currentContext } from '../context/tenant-context';

export interface AuditEntry {
  tenantId?: string; // defaults to request context
  actorUserId?: string | null; // defaults to request context
  action: string; // e.g. 'auth.login', 'bill.void', 'menu.item.price_override'
  entity: string; // table / aggregate name
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Immutable audit trail. Rows are INSERT-only at the DB level (no UPDATE/DELETE grant, RLS policy
 * only allows insert+select). Always write inside the same transaction as the money mutation
 * so the log cannot diverge from the data.
 */
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Write inside an existing tenant-bound transaction (preferred for money paths). */
  async recordIn(tx: Prisma.TransactionClient, e: AuditEntry): Promise<void> {
    const ctx = currentContext();
    const tenantId = e.tenantId ?? ctx?.tenantId;
    if (!tenantId) throw new Error('audit: tenantId required');
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: e.actorUserId === undefined ? (ctx?.userId ?? null) : e.actorUserId,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        before: (e.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        after: (e.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        ip: e.ip ?? null,
        requestId: ctx?.requestId ?? null,
        meta: (e.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }

  /** Standalone write (own short transaction) — for non-money events like login/lockout. */
  record(e: AuditEntry): Promise<void> {
    const tenantId = e.tenantId ?? currentContext()?.tenantId;
    if (!tenantId) throw new Error('audit: tenantId required');
    return this.prisma.withTenant(tenantId, (tx) => this.recordIn(tx, { ...e, tenantId }));
  }
}
