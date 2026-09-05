import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { globalRateLimit } from './middlewares/rate-limit.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.middleware';
import { buildOpenApiDocument } from './utils/openapi';
import { mountRoutes } from './routes';

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

  mountRoutes(app);

  const openApiDocument = buildOpenApiDocument();
  app.get('/docs.json', (_req, res) => res.json(openApiDocument));
  app.use('/docs', ...swaggerUi.serve, swaggerUi.setup(openApiDocument, { customSiteTitle: 'BillBistro API' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
