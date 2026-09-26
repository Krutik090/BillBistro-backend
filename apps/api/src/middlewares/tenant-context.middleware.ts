import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler } from 'express';
import { requestContext, type RequestContext } from '../context/tenant-context';
import { HttpException } from '../utils/errors';
import { env } from '../config/env';
import { prisma } from '../database/client';

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

let cachedTenantId: string | null = null;

/**
 * Binds request context for PUBLIC routes serving customers, not staff (QR menu/ordering) — there
 * is no JWT principal, so the tenant is resolved from PUBLIC_TENANT_SLUG instead. This app is now
 * single-restaurant, so "the tenant" is a fixed, cacheable lookup, not a per-request unknown.
 */
export const bindPublicTenantContext: RequestHandler = async (req, _res, next) => {
  try {
    if (!cachedTenantId) {
      const tenant = await prisma.system((tx) => tx.tenant.findFirst({ where: { slug: env.PUBLIC_TENANT_SLUG, deletedAt: null } }));
      if (!tenant) throw new HttpException('Restaurant not configured yet — run npm run db:seed', 503);
      cachedTenantId = tenant.id;
    }
    const ctx: RequestContext = {
      tenantId: cachedTenantId,
      userId: null,
      roles: [],
      permissions: [],
      requestId: (req.headers['x-request-id'] as string) ?? randomUUID(),
    };
    requestContext.run(ctx, () => next());
  } catch (err) {
    next(err);
  }
};
