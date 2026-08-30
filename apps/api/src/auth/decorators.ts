import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthPrincipal } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Skip JWT auth for this route (login, health...). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** Require ALL listed permission keys (e.g. 'menu.write'). */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const ALLOW_AUTHENTICATED = 'allowAuthenticated';
/**
 * Route needs a valid session but no specific permission (e.g. /auth/me).
 * PermissionsGuard is deny-by-default: a non-public route must carry either
 * @RequirePermissions(...) or @AllowAuthenticated(), otherwise it is 403.
 */
export const AllowAuthenticated = () => SetMetadata(ALLOW_AUTHENTICATED, true);

/** Injects the authenticated principal. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthPrincipal => {
  return ctx.switchToHttp().getRequest().user;
});
