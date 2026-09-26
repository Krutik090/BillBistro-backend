import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request principal + tenant scope. Populated from the JWT by TenantContextInterceptor. */
export interface RequestContext {
  tenantId: string;
  /** null for unauthenticated public requests (e.g. QR customer ordering) — no principal attached. */
  userId: string | null;
  roles: string[];
  permissions: string[];
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function requireTenantId(): string {
  const ctx = requestContext.getStore();
  if (!ctx?.tenantId) throw new Error('No tenant context bound to this request');
  return ctx.tenantId;
}
