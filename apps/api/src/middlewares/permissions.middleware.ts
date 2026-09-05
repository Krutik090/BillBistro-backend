import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ForbiddenException, UnauthorizedException } from '../utils/errors';
import { verifyAccessToken } from './auth.middleware';
import { bindTenantContext } from './tenant-context.middleware';

/**
 * RBAC, DENY-BY-DEFAULT — enforced structurally: `route()` demands a Policy, so a route cannot be
 * registered without declaring one. There is no "no policy" state to fall through.
 *
 *  - PUBLIC              → no token required
 *  - AUTHENTICATED       → any valid session (e.g. /auth/me)
 *  - permissions(...)    → principal must hold EVERY listed key
 */
export type Policy = { kind: 'public' } | { kind: 'authenticated' } | { kind: 'permissions'; required: string[] };

export const PUBLIC: Policy = { kind: 'public' };
export const AUTHENTICATED: Policy = { kind: 'authenticated' };
export const permissions = (...required: string[]): Policy => ({ kind: 'permissions', required });

/** Authenticate (unless public), authorize, then bind the tenant context for the rest of the chain. */
export function requirePolicy(policy: Policy): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (policy.kind === 'public') return next();

    const principal = verifyAccessToken(req);
    if (!principal) return next(new UnauthorizedException('Missing or invalid access token'));
    req.user = principal;

    if (policy.kind === 'permissions') {
      const missing = policy.required.filter((p) => !principal.permissions.includes(p));
      if (missing.length) return next(new ForbiddenException(`Missing permission: ${missing.join(', ')}`));
    }

    bindTenantContext(req, next);
  };
}
