import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './database/client';
import { initRedis, getRedisClient } from './config/redis';

async function bootstrap() {
  await Promise.all([prisma.$connect(), initRedis()]);

  const server = createApp().listen(env.API_PORT, () => {
    console.log(`API on http://localhost:${env.API_PORT}  docs: /docs  health: /health`);
  });

  // Drain in-flight requests, then release the connection pool.
  const shutdown = (signal: string) => {
    console.log(`${signal} received — shutting down`);
    server.close(() => {
      getRedisClient()?.disconnect();
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
