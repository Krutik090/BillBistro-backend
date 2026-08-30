import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthPrincipal } from './auth.types';

export const IS_PUBLIC = 'isPublic';
/** Skip JWT auth for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSIONS_KEY = 'permissions';
/** Require ALL listed permission keys (e.g. 'menu.write'). */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

/** Injects the authenticated principal. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthPrincipal => {
  return ctx.switchToHttp().getRequest().user;
});
