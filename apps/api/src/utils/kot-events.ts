import { EventEmitter } from 'node:events';

/**
 * In-process KOT event bus (single-instance dev/small-deploy scope — a multi-instance rollout would
 * swap this for Redis pub/sub without touching callers, since publish/subscribe stay the same shape).
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

const key = (tenantId: string, outletId: string) => `${tenantId}:${outletId}`;

/** Called after a KOT is created or its status changes. */
export function publishKot(tenantId: string, outletId: string, kot: unknown): void {
  bus.emit(key(tenantId, outletId), kot);
}

/** Subscribes to KOT events for one tenant+outlet. Returns an unsubscribe function. */
export function subscribeKot(tenantId: string, outletId: string, onKot: (kot: unknown) => void): () => void {
  const k = key(tenantId, outletId);
  bus.on(k, onKot);
  return () => bus.off(k, onKot);
}
