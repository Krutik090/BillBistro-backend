import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import { env } from '../config/env';
import { reasonFor } from '../common/errors';

const limiter = (windowMs: number, limit: number): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // Same body shape as every other error response.
    handler: (req, res) =>
      res.status(429).json({
        statusCode: 429,
        error: reasonFor(429),
        message: 'ThrottlerException: Too Many Requests',
        path: req.originalUrl,
      }),
  });

/** Global per-IP limit; auth routes attach their own tighter limiters on top. */
export const globalRateLimit = limiter(env.THROTTLE_TTL_MS, env.THROTTLE_LIMIT);
export const loginRateLimit = limiter(60_000, 10);
export const refreshRateLimit = limiter(60_000, 30);
