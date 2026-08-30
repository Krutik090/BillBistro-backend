import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessClaims, AuthPrincipal, RefreshClaims } from './auth.types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  principal: AuthPrincipal;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** tenantSlug + email + password → token pair. Tenant lookup is the one system-context read. */
  async login(tenantSlug: string, email: string, password: string, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    const tenant = await this.prisma.system((tx) => tx.tenant.findFirst({ where: { slug: tenantSlug, deletedAt: null } }));
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.withTenant(tenant.id, (tx) =>
      tx.user.findFirst({
        where: { tenantId: tenant.id, email: email.toLowerCase(), isActive: true, deletedAt: null },
        include: { userRoles: { where: { deletedAt: null }, include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      }),
    );
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Invalid credentials');

    const roles = [...new Set(user.userRoles.map((ur) => ur.role.key))];
    const permissions = [...new Set(user.userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)))];
    const principal: AuthPrincipal = { userId: user.id, tenantId: tenant.id, roles, permissions };

    await this.prisma.withTenant(tenant.id, (tx) => tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }));
    return this.issue(principal, meta);
  }

  /** Rotate: verify refresh JWT, match hashed jti in DB, revoke it, issue a fresh pair. */
  async refresh(refreshToken: string, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, { secret: env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const principal = await this.prisma.withTenant(claims.tid, async (tx) => {
      const row = await tx.refreshToken.findFirst({ where: { tokenHash: sha256(claims.jti), userId: claims.sub, revokedAt: null, deletedAt: null } });
      if (!row || row.expiresAt < new Date()) throw new UnauthorizedException('Refresh token revoked or expired');
      await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
      const user = await tx.user.findFirst({
        where: { id: claims.sub, isActive: true, deletedAt: null },
        include: { userRoles: { where: { deletedAt: null }, include: { role: { include: { permissions: { include: { permission: true } } } } } } },
      });
      if (!user) throw new UnauthorizedException('User disabled');
      return {
        userId: user.id,
        tenantId: claims.tid,
        roles: [...new Set(user.userRoles.map((ur) => ur.role.key))],
        permissions: [...new Set(user.userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)))],
      } satisfies AuthPrincipal;
    });
    return this.issue(principal, meta);
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, { secret: env.JWT_REFRESH_SECRET, ignoreExpiration: true });
      await this.prisma.withTenant(claims.tid, (tx) =>
        tx.refreshToken.updateMany({ where: { tokenHash: sha256(claims.jti), revokedAt: null }, data: { revokedAt: new Date() } }),
      );
    } catch {
      /* already invalid — nothing to revoke */
    }
  }

  private async issue(principal: AuthPrincipal, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);
    await this.prisma.withTenant(principal.tenantId, (tx) =>
      tx.refreshToken.create({
        data: { tenantId: principal.tenantId, userId: principal.userId, tokenHash: sha256(jti), expiresAt, userAgent: meta.ua?.slice(0, 255), ip: meta.ip },
      }),
    );
    const access: AccessClaims = { sub: principal.userId, tid: principal.tenantId, roles: principal.roles, perms: principal.permissions };
    const refresh: RefreshClaims = { sub: principal.userId, tid: principal.tenantId, jti };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(access, { secret: env.JWT_ACCESS_SECRET, expiresIn: env.JWT_ACCESS_TTL_SECONDS }),
      this.jwt.signAsync(refresh, { secret: env.JWT_REFRESH_SECRET, expiresIn: env.JWT_REFRESH_TTL_DAYS * 86_400 }),
    ]);
    return { accessToken, refreshToken, principal };
  }
}
