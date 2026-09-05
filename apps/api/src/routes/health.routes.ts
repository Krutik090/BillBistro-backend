import { PUBLIC, makeRouter } from './router';
import * as healthController from '../controllers/health.controller';

export const healthRoutes = makeRouter(
  [
    {
      method: 'get',
      path: '/',
      policy: PUBLIC,
      tags: ['health'],
      summary: 'Liveness + database reachability',
      handler: healthController.getHealth,
    },
  ],
  '/health',
);
