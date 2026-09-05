import type { Request, Response } from 'express';
import type { LoginRequest } from '@billbistro/types';
import { UnauthorizedException } from '../utils/errors';
import { env } from '../config/env';
import { auth } from '../container';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../types/auth.types';
import type { TokenPair } from '../services/auth.service';

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

export async function login(req: Request, res: Response) {
  const { tenantSlug, email, password } = req.body as LoginRequest;
  const pair = await auth.login(tenantSlug, email, password, meta(req));
  setCookies(res, pair);
  return { user: pair.principal, accessToken: pair.accessToken };
}

export async function refresh(req: Request, res: Response) {
  const rt = req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string } | undefined)?.refreshToken;
  if (!rt) throw new UnauthorizedException('Missing refresh token');
  const pair = await auth.refresh(rt, meta(req));
  setCookies(res, pair);
  return { user: pair.principal, accessToken: pair.accessToken };
}

export async function logout(req: Request, res: Response) {
  await auth.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
}

export function me(req: Request) {
  return req.user;
}
