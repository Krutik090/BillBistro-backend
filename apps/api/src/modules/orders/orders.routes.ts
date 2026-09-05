import { makeRouter, permissions, validQuery, type RouteSpec } from '../../common/router';
import { orders } from '../../services';
import * as S from './orders.schemas';

const tags = ['orders'];

/** Orders + KOTs. Server computes all money; client never sends amounts. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/orders', policy: permissions('orders.read'), query: S.ListOrdersQuery, tags, handler: (req) => orders.list(validQuery(req)) },
  { method: 'get', path: '/orders/:id', policy: permissions('orders.read'), uuidParams: ['id'], tags, handler: (req) => orders.get(req.params.id) },
  {
    method: 'post',
    path: '/orders',
    policy: permissions('orders.write'),
    body: S.CreateOrder,
    tags,
    summary: 'Create an order (idempotent on clientKey, lines priced server-side)',
    handler: (req) => orders.create(req.body),
  },
  {
    method: 'patch',
    path: '/orders/:id/items',
    policy: permissions('orders.write'),
    uuidParams: ['id'],
    body: S.ReplaceItems,
    tags,
    summary: 'Replace the line set (KOT-sent lines immutable; optimistic `version`)',
    handler: (req) => orders.replaceItems(req.params.id, req.body),
  },
  { method: 'post', path: '/orders/:id/kots', policy: permissions('kots.write'), uuidParams: ['id'], body: S.CreateKot, tags, summary: 'Send pending lines to the kitchen', handler: (req) => orders.createKot(req.params.id, req.body) },
  { method: 'post', path: '/orders/:id/cancel', policy: permissions('orders.write'), uuidParams: ['id'], body: S.CancelOrder, tags, handler: (req) => orders.cancel(req.params.id, req.body) },

  // KDS feed
  { method: 'get', path: '/kots', policy: permissions('kots.read'), query: S.ListKotsQuery, tags: ['kots'], summary: 'Kitchen display feed', handler: (req) => orders.listKots(validQuery(req)) },
  { method: 'patch', path: '/kots/:id/status', policy: permissions('kots.write'), uuidParams: ['id'], body: S.SetKotStatus, tags: ['kots'], handler: (req) => orders.setKotStatus(req.params.id, req.body) },
];

export const ordersRoutes = makeRouter(specs, '/v1');
