import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthPrincipal } from './auth.types';
import { ALLOW_AUTHENTICATED, IS_PUBLIC, PERMISSIONS_KEY } from './decorators';

/**
 * RBAC, DENY-BY-DEFAULT.
 *  - @Public()               → allowed (JwtAuthGuard already skipped auth)
 *  - @RequirePermissions(..) → principal must hold every listed key
 *  - @AllowAuthenticated()   → any valid principal
 *  - none of the above       → 403 (a route that forgot to declare its policy is closed, not open)
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly log = new Logger(PermissionsGuard.name);
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const user: AuthPrincipal | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('No principal');

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    if (required?.length) {
      const missing = required.filter((p) => !user.permissions.includes(p));
      if (missing.length) throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_AUTHENTICATED, targets)) return true;

    this.log.warn(`Route ${context.getClass().name}.${context.getHandler().name} declares no permission policy — denied`);
    throw new ForbiddenException('Route has no permission policy');
  }
}
