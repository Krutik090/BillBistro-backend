import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../config/env';
import { ACCESS_COOKIE, AccessClaims, AuthPrincipal } from './auth.types';
import { IS_PUBLIC } from './decorators';

/** Verifies the access JWT (httpOnly cookie, or Bearer header for non-browser clients) → req.user */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthPrincipal }>();
    const token = this.extract(req);
    if (!token) throw new UnauthorizedException('Missing access token');
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, { secret: env.JWT_ACCESS_SECRET });
      req.user = { userId: claims.sub, tenantId: claims.tid, roles: claims.roles ?? [], permissions: claims.perms ?? [] };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extract(req: Request): string | undefined {
    const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[ACCESS_COOKIE];
    if (cookie) return cookie;
    const h = req.headers.authorization;
    if (h?.startsWith('Bearer ')) return h.slice(7);
    return undefined;
  }
}
