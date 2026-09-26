import { makeRouter, permissions, type RouteSpec } from './router';
import * as ordersController from '../controllers/orders.controller';
import * as S from '../schemas/orders.schemas';

const tags = ['orders'];

/** Orders + KOTs. Server computes all money; client never sends amounts. */
const specs: RouteSpec[] = [
  { method: 'get', path: '/orders', policy: permissions('orders.read'), query: S.ListOrdersQuery, tags, handler: ordersController.list },
  { method: 'get', path: '/orders/:id', policy: permissions('orders.read'), uuidParams: ['id'], tags, handler: ordersController.get },
  {
    method: 'post',
    path: '/orders',
    policy: permissions('orders.write'),
    body: S.CreateOrder,
    tags,
    summary: 'Create an order (idempotent on clientKey, lines priced server-side)',
    handler: ordersController.create,
  },
  {
    method: 'patch',
    path: '/orders/:id/items',
    policy: permissions('orders.write'),
    uuidParams: ['id'],
    body: S.ReplaceItems,
    tags,
    summary: 'Replace the line set (KOT-sent lines immutable; optimistic `version`)',
    handler: ordersController.replaceItems,
  },
  { method: 'post', path: '/orders/:id/kots', policy: permissions('kots.write'), uuidParams: ['id'], body: S.CreateKot, tags, summary: 'Send pending lines to the kitchen', handler: ordersController.createKot },
  { method: 'post', path: '/orders/:id/cancel', policy: permissions('orders.write'), uuidParams: ['id'], body: S.CancelOrder, tags, handler: ordersController.cancel },

  // KDS feed
  { method: 'get', path: '/kots', policy: permissions('kots.read'), query: S.ListKotsQuery, tags: ['kots'], summary: 'Kitchen display feed', handler: ordersController.listKots },
  { method: 'patch', path: '/kots/:id/status', policy: permissions('kots.write'), uuidParams: ['id'], body: S.SetKotStatus, tags: ['kots'], handler: ordersController.setKotStatus },
  { method: 'get', path: '/kots/stream', policy: permissions('kots.read'), query: S.ListKotsQuery, tags: ['kots'], summary: 'Server-Sent Events: push a KOT row on create/status-change/cancel for one outlet', handler: ordersController.streamKots },
];

export const ordersRoutes = makeRouter(specs, '/v1');
