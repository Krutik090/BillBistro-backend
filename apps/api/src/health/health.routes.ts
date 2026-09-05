import { PUBLIC, makeRouter } from '../common/router';
import { prisma } from '../services';

export const healthRoutes = makeRouter([
  {
    method: 'get',
    path: '/',
    policy: PUBLIC,
    tags: ['health'],
    summary: 'Liveness + database reachability',
    handler: async () => {
      let db: 'up' | 'down' = 'up';
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        db = 'down';
      }
      return { status: 'ok', db, version: process.env.npm_package_version ?? '0.0.1', time: new Date().toISOString() };
    },
  },
], '/health');
