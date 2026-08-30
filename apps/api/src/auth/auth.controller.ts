import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LoginRequest } from '@billbistro/types';
import { ZodValidationPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { AuthService, TokenPair } from './auth.service';
import { ACCESS_COOKIE, AuthPrincipal, REFRESH_COOKIE } from './auth.types';
import { AllowAuthenticated, CurrentUser, Public } from './decorators';
import { Throttle } from '@nestjs/throttler';

type Req = Request & { cookies?: Record<string, string> };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiBody({ schema: { example: { tenantSlug: 'demo', email: 'owner@demo.local', password: 'Password123!' } } })
  async login(@Body(new ZodValidationPipe(LoginRequest)) body: LoginRequest, @Req() req: Req, @Res({ passthrough: true }) res: Response) {
    const pair = await this.auth.login(body.tenantSlug, body.email, body.password, meta(req));
    this.setCookies(res, pair);
    return { user: pair.principal, accessToken: pair.accessToken };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Req, @Res({ passthrough: true }) res: Response) {
    const rt = req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string })?.refreshToken;
    if (!rt) throw new UnauthorizedException('Missing refresh token');
    const pair = await this.auth.refresh(rt, meta(req));
    this.setCookies(res, pair);
    return { user: pair.principal, accessToken: pair.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Req, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
  }

  @AllowAuthenticated()
  @Get('me')
  me(@CurrentUser() user: AuthPrincipal) {
    return user;
  }

  private setCookies(res: Response, pair: TokenPair) {
    const base = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' as const };
    res.cookie(ACCESS_COOKIE, pair.accessToken, { ...base, path: '/' });
    res.cookie(REFRESH_COOKIE, pair.refreshToken, { ...base, path: '/v1/auth', maxAge: env.JWT_REFRESH_TTL_DAYS * 86_400_000 });
  }
}

function meta(req: Request) {
  return { ua: req.headers['user-agent'], ip: req.ip };
}
