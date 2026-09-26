import type { Express } from 'express';
import { healthRoutes } from './health.routes';
import { authRoutes } from './auth.routes';
import { menuRoutes } from './menu.routes';
import { floorRoutes } from './floor.routes';
import { outletsRoutes } from './outlets.routes';
import { ordersRoutes } from './orders.routes';
import { billingRoutes } from './billing.routes';
import { reportsRoutes } from './reports.routes';
import { inventoryRoutes } from './inventory.routes';
import { publicRoutes } from './public.routes';

/** Mounts every domain router. health is intentionally outside the /v1 prefix. */
export function mountRoutes(app: Express): void {
  app.use('/health', healthRoutes);
  app.use('/v1/auth', authRoutes);
  app.use('/v1/menu', menuRoutes);
  app.use('/v1/floor', floorRoutes);
  app.use('/v1/outlets', outletsRoutes);
  app.use('/v1', ordersRoutes);
  app.use('/v1', billingRoutes);
  app.use('/v1', reportsRoutes);
  app.use('/v1', inventoryRoutes);
  app.use('/v1/public', publicRoutes);
}
