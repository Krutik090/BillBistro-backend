import type { Request, Response } from 'express';
import { orders } from '../container';
import { validQuery } from '../routes/router';
import { requireTenantId } from '../context/tenant-context';
import { subscribeKot } from '../utils/kot-events';
import type * as S from '../schemas/orders.schemas';

export const list = (req: Request) => orders.list(validQuery<S.ListOrdersQuery>(req));
export const get = (req: Request) => orders.get(req.params.id);
export const create = (req: Request) => orders.create(req.body as S.CreateOrder);
export const replaceItems = (req: Request) => orders.replaceItems(req.params.id, req.body as S.ReplaceItems);
export const createKot = (req: Request) => orders.createKot(req.params.id, req.body as S.CreateKot);
export const cancel = (req: Request) => orders.cancel(req.params.id, req.body as S.CancelOrder);

// KDS feed
export const listKots = (req: Request) => orders.listKots(validQuery<S.ListKotsQuery>(req));
export const setKotStatus = (req: Request) => orders.setKotStatus(req.params.id, req.body as S.SetKotStatus);

/**
 * Server-Sent Events push of KOT create/status-change/cancel for one outlet (T-105). Kept in the
 * controller, not the service, since it's the one place framework (Express res) plumbing belongs —
 * orders.service stays framework-agnostic and just calls publishKot() after a mutation.
 */
export function streamKots(req: Request, res: Response): Promise<void> {
  const { outletId } = validQuery<S.ListKotsQuery>(req);
  const tenantId = requireTenantId();
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
  res.write(': connected\n\n');
  const unsubscribe = subscribeKot(tenantId, outletId, (kot) => res.write(`event: kot\ndata: ${JSON.stringify(kot)}\n\n`));
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);
  return new Promise<void>((resolve) => {
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); res.end(); resolve(); });
  });
}
