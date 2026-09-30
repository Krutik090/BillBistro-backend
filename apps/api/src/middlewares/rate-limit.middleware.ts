import type { RequestHandler } from 'express';
import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env';
import { getRedisClient } from '../config/redis';
import { reasonFor } from '../utils/errors';

const limiter = (windowMs: number, limit: number, prefix: string): RateLimitRequestHandler => {
  const redis = getRedisClient();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // ioredis's `call` overloads don't line up 1:1 with rate-limit-redis's variadic SendCommandFn type.
    store: redis ? new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (async (...args: string[]) => redis.call(args[0], args.slice(1))) as never }) : undefined,
    // Same body shape as every other error response.
    handler: (req, res) =>
      res.status(429).json({
        statusCode: 429,
        error: reasonFor(429),
        message: 'ThrottlerException: Too Many Requests',
        path: req.originalUrl,
      }),
  });
};

/**
 * Builds the real rate-limit handler on the FIRST request rather than at import time, so it reads
 * whichever Redis client `initRedis()` resolved (server.ts awaits that before `.listen()`, and no
 * request can arrive before then) — while still exporting a plain, ready-to-mount middleware
 * synchronously, so every call site (app.ts, auth.routes.ts, public.routes.ts) is unchanged.
 */
const lazyLimiter = (windowMs: number, limit: number, prefix: string): RequestHandler => {
  let handler: RateLimitRequestHandler | undefined;
  return (req, res, next) => {
    handler ??= limiter(windowMs, limit, prefix);
    handler(req, res, next);
  };
};

/** Global per-IP limit; auth routes attach their own tighter limiters on top. */
export const globalRateLimit = lazyLimiter(env.THROTTLE_TTL_MS, env.THROTTLE_LIMIT, 'global');
export const loginRateLimit = lazyLimiter(60_000, 10, 'login');
export const refreshRateLimit = lazyLimiter(60_000, 30, 'refresh');
/** POST /v1/public/orders is unauthenticated (customer QR ordering) — tighter per-IP limit than authenticated writes. */
export const publicOrderRateLimit = lazyLimiter(60_000, 10, 'public-order');
