import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { env } from '../config/env';
import { ACCESS_COOKIE, type AccessClaims, type AuthPrincipal } from '../auth/auth.types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}

/** Access token comes from the httpOnly cookie, or a Bearer header for non-browser clients. */
function extract(req: Request): string | undefined {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (cookie) return cookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** Returns the principal for a valid access token, or undefined (missing/expired/tampered). */
export function verifyAccessToken(req: Request): AuthPrincipal | undefined {
  const token = extract(req);
  if (!token) return undefined;
  try {
    const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;
    return {
      userId: claims.sub,
      tenantId: claims.tid,
      roles: claims.roles ?? [],
      permissions: claims.perms ?? [],
    };
  } catch {
    return undefined;
  }
}
