import { Redis } from 'ioredis';
import { env } from './env';

let client: Redis | null = null;
let resolved = false;

/**
 * Connects once at boot, with a bounded wait so a missing Redis (e.g. local `npm run api:dev`
 * without Docker) can't hang startup. Docker Compose already gates the api container on Redis's
 * healthcheck, so in that deployment this resolves near-instantly. `server.ts` awaits this before
 * `.listen()`, so by the time any request reaches the lazily-built rate limiters (see
 * `middlewares/rate-limit.middleware.ts`), the decision below is already final.
 */
export async function initRedis(): Promise<Redis | null> {
  if (resolved) return client;
  resolved = true;
  const c = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  c.on('error', () => {
    /* swallowed here — connect()/call() failures are handled at each call site */
  });
  try {
    await Promise.race([
      c.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connect timed out')), 3000)),
    ]);
    client = c;
    console.log('[redis] connected — rate limiting is Redis-backed');
  } catch (err) {
    c.disconnect();
    client = null;
    console.warn(`[redis] unavailable (${(err as Error).message}) — falling back to in-memory rate limiting`);
  }
  return client;
}

export const getRedisClient = () => client;
