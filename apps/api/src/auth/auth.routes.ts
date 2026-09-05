import type { Request, Response } from 'express';
import { LoginRequest } from '@billbistro/types';
import { AUTHENTICATED, PUBLIC, makeRouter } from '../common/router';
import { UnauthorizedException } from '../common/errors';
import { loginRateLimit, refreshRateLimit } from '../middleware/rate-limit';
import { env } from '../config/env';
import { auth } from '../services';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.types';
import type { TokenPair } from './auth.service';

const meta = (req: Request) => ({ ua: req.headers['user-agent'], ip: req.ip });

function setCookies(res: Response, pair: TokenPair) {
  const base = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' as const };
  res.cookie(ACCESS_COOKIE, pair.accessToken, { ...base, path: '/' });
  res.cookie(REFRESH_COOKIE, pair.refreshToken, {
    ...base,
    path: '/v1/auth',
    maxAge: env.JWT_REFRESH_TTL_DAYS * 86_400_000,
  });
}

export const authRoutes = makeRouter([
  {
    method: 'post',
    path: '/login',
    policy: PUBLIC,
    status: 200,
    middleware: [loginRateLimit],
    body: LoginRequest,
    tags: ['auth'],
    summary: 'Sign in with tenant slug + email + password',
    handler: async (req, res) => {
      const { tenantSlug, email, password } = req.body as LoginRequest;
      const pair = await auth.login(tenantSlug, email, password, meta(req));
      setCookies(res, pair);
      return { user: pair.principal, accessToken: pair.accessToken };
    },
  },
  {
    method: 'post',
    path: '/refresh',
    policy: PUBLIC,
    status: 200,
    middleware: [refreshRateLimit],
    tags: ['auth'],
    summary: 'Rotate the refresh token and issue a new pair',
    handler: async (req, res) => {
      const rt = req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string } | undefined)?.refreshToken;
      if (!rt) throw new UnauthorizedException('Missing refresh token');
      const pair = await auth.refresh(rt, meta(req));
      setCookies(res, pair);
      return { user: pair.principal, accessToken: pair.accessToken };
    },
  },
  {
    method: 'post',
    path: '/logout',
    policy: PUBLIC,
    status: 204,
    tags: ['auth'],
    summary: 'Revoke the refresh token and clear cookies',
    handler: async (req, res) => {
      await auth.logout(req.cookies?.[REFRESH_COOKIE]);
      res.clearCookie(ACCESS_COOKIE, { path: '/' });
      res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
    },
  },
  {
    method: 'get',
    path: '/me',
    policy: AUTHENTICATED,
    tags: ['auth'],
    summary: 'Current principal (roles + permissions)',
    handler: (req) => req.user,
  },
], '/v1/auth');
