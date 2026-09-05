import { randomUUID } from 'node:crypto';
import type { NextFunction, Request } from 'express';
import { requestContext, type RequestContext } from '../context/tenant-context';

/**
 * Runs the rest of the request inside an AsyncLocalStorage scope carrying tenant/user/roles.
 * `prisma.scoped` reads the tenant id from here to set the per-transaction RLS GUC.
 */
export function bindTenantContext(req: Request, next: NextFunction): void {
  const principal = req.user;
  if (!principal) return next();

  const ctx: RequestContext = {
    tenantId: principal.tenantId,
    userId: principal.userId,
    roles: principal.roles,
    permissions: principal.permissions,
    requestId: (req.headers['x-request-id'] as string) ?? randomUUID(),
  };
  requestContext.run(ctx, () => next());
}
