import { ConflictException, HttpException, UnauthorizedException } from '../utils/errors';
import { AuditService } from './audit.service';
import type { JwtService } from '../utils/jwt';
import argon2 from 'argon2';
import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { PrismaService } from '../database/client';
import { ROLE_PERMISSIONS } from '../config/roles';
import type { AccessClaims, AuthPrincipal, RefreshClaims } from '../types/auth.types';
import type { SignupRequest } from '@billbistro/types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  principal: AuthPrincipal;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
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
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.record({ tenantId: tenant.id, actorUserId: user.id, action: 'auth.login_locked', entity: 'users', entityId: user.id, ip: meta.ip });
      throw new HttpException({ message: 'Account temporarily locked', lockedUntil: user.lockedUntil }, 423);
    }
    if (!(await argon2.verify(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      const lock = failed >= env.LOGIN_MAX_FAILURES;
      const lockedUntil = lock ? new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60_000) : null;
      await this.prisma.withTenant(tenant.id, async (tx) => {
        await tx.user.update({ where: { id: user.id }, data: { failedLogins: lock ? 0 : failed, lockedUntil } });
        await this.audit.recordIn(tx, {
          tenantId: tenant.id,
          actorUserId: user.id,
          action: lock ? 'auth.lockout' : 'auth.login_failed',
          entity: 'users',
          entityId: user.id,
          ip: meta.ip,
          meta: { failed, lockedUntil },
        });
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const roles = [...new Set(user.userRoles.map((ur) => ur.role.key))];
    const permissions = [...new Set(user.userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key)))];
    const principal: AuthPrincipal = { userId: user.id, tenantId: tenant.id, roles, permissions };

    await this.prisma.withTenant(tenant.id, async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null } });
      await this.audit.recordIn(tx, { tenantId: tenant.id, actorUserId: user.id, action: 'auth.login', entity: 'users', entityId: user.id, ip: meta.ip, meta: { ua: meta.ua } });
    });
    return this.issue(principal, meta);
  }

  /**
   * Self-serve onboarding (T-106): tenant + the standard role set + owner user + first outlet,
   * provisioned in one transaction, then auto-login (same TokenPair shape as login/refresh).
   * Runs under app.bypass_rls — there is no tenant yet for the row-level policies to scope to.
   */
  async signup(input: SignupRequest, meta: { ua?: string; ip?: string }): Promise<TokenPair> {
    const slug = input.tenantSlug.toLowerCase();
    const email = input.email.toLowerCase();
    const passwordHash = await argon2.hash(input.password);

    const principal = await this.prisma.system(async (tx) => {
      if (await tx.tenant.findFirst({ where: { slug } })) throw new ConflictException('That restaurant URL is already taken');

      const tenantId = randomUUID();
      await tx.tenant.create({ data: { id: tenantId, tenantId, slug, name: input.tenantName } });

      const permissions = await tx.permission.findMany();
      const permId = Object.fromEntries(permissions.map((p) => [p.key, p.id]));

      let ownerRoleId = '';
      for (const [key, keys] of Object.entries(ROLE_PERMISSIONS)) {
        const role = await tx.role.create({ data: { tenantId, key, name: key[0].toUpperCase() + key.slice(1), isSystem: true } });
        if (key === 'owner') ownerRoleId = role.id;
        if (keys.length) await tx.rolePermission.createMany({ data: keys.map((pk) => ({ tenantId, roleId: role.id, permissionId: permId[pk] })) });
      }

      await tx.outlet.create({ data: { tenantId, code: 'MAIN', name: input.outletName ?? 'Main Outlet' } });
      const user = await tx.user.create({ data: { tenantId, email, name: input.ownerName, passwordHash } });
      await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: ownerRoleId } });
      await this.audit.recordIn(tx, { tenantId, actorUserId: user.id, action: 'tenant.signup', entity: 'tenants', entityId: tenantId, after: { slug, name: input.tenantName }, ip: meta.ip });

      return { userId: user.id, tenantId, roles: ['owner'], permissions: [...ROLE_PERMISSIONS.owner] } satisfies AuthPrincipal;
    });

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
