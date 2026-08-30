import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { randomUUID } from 'node:crypto';
import { requestContext, RequestContext } from './tenant-context';
import type { AuthPrincipal } from '../auth/auth.types';

/** Runs the route handler inside an AsyncLocalStorage scope carrying tenant/user/roles. */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const principal: AuthPrincipal | undefined = req.user;
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    if (!principal) return next.handle(); // public route — no tenant scope

    const ctx: RequestContext = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      roles: principal.roles,
      permissions: principal.permissions,
      requestId,
    };
    return new Observable((subscriber) => {
      requestContext.run(ctx, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
