import { makeRouter, PUBLIC, type RouteSpec } from './router';
import { publicOrderRateLimit } from '../middlewares/rate-limit.middleware';
import { bindPublicTenantContext } from '../middlewares/tenant-context.middleware';
import * as publicController from '../controllers/public.controller';
import { CreateOrder } from '../schemas/orders.schemas';

/**
 * Customer-facing QR ordering (T-108) — single-restaurant deployment, no staff session. Tighter
 * rate limit than any authenticated write route. Orders land OPEN, same as any other order; staff
 * still sends them to KOT from POS/dashboard — no auto-KOT-send or payment here (basic scope).
 */
const specs: RouteSpec[] = [
  {
    method: 'post',
    path: '/orders',
    policy: PUBLIC,
    middleware: [publicOrderRateLimit, bindPublicTenantContext],
    body: CreateOrder,
    tags: ['public'],
    summary: 'Customer QR ordering — create an order with no staff session (server-priced, same as the staff path)',
    handler: publicController.createOrder,
  },
];

export const publicRoutes = makeRouter(specs, '/v1/public');
