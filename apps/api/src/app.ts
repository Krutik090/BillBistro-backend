import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { globalRateLimit } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { buildOpenApiDocument } from './common/openapi';
import { authRoutes } from './auth/auth.routes';
import { healthRoutes } from './health/health.routes';
import { menuRoutes } from './modules/menu/menu.routes';
import { floorRoutes } from './modules/floor/floor.routes';
import { outletsRoutes } from './modules/outlets/outlets.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { billingRoutes } from './modules/billing/billing.routes';

/**
 * Builds the Express app. Middleware order mirrors the guard chain it replaces:
 * rate-limit → authenticate → authorize (deny-by-default) → bind tenant context → handler,
 * with authenticate/authorize/bind applied per route by `requirePolicy`.
 */
export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1); // correct client IP for throttling/lockout behind a proxy
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalRateLimit);

  // health is intentionally outside the /v1 prefix
  app.use('/health', healthRoutes);

  app.use('/v1/auth', authRoutes);
  app.use('/v1/menu', menuRoutes);
  app.use('/v1/floor', floorRoutes);
  app.use('/v1/outlets', outletsRoutes);
  app.use('/v1', ordersRoutes);
  app.use('/v1', billingRoutes);

  const openApiDocument = buildOpenApiDocument();
  app.get('/docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/docs', ...swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'BillBistro API' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
