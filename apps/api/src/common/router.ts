import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { ZodSchema } from 'zod';
import { BadRequestException } from './errors';
import { requirePolicy, type Policy } from '../middleware/permissions';

export { PUBLIC, AUTHENTICATED, permissions, type Policy } from '../middleware/permissions';

export interface RouteSpec {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  /**
   * REQUIRED. There is no way to register a route without stating its access policy, which is how
   * deny-by-default is enforced structurally rather than by a runtime check that a route "forgot".
   */
  policy: Policy;
  handler: (req: Request, res: Response) => unknown;
  /** Zod schemas validated at the boundary; parsed values replace req.body / req.query. */
  body?: ZodSchema;
  query?: ZodSchema;
  /** Route params that must be UUIDs (mirrors Nest's ParseUUIDPipe). */
  uuidParams?: string[];
  /** Overrides the default status (201 for POST, 200 otherwise). */
  status?: number;
  /** Extra middleware, e.g. a tighter rate limit on auth routes. */
  middleware?: RequestHandler[];
  summary?: string;
  tags?: string[];
  /** Filled in at registration: the path as actually mounted (used for the OpenAPI document). */
  fullPath?: string;
}

/** Every registered route, used to generate the OpenAPI document. */
export const routeRegistry: (RouteSpec & { fullPath: string })[] = [];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate(spec: RouteSpec): RequestHandler {
  return (req, _res, next) => {
    for (const p of spec.uuidParams ?? []) {
      if (!UUID_RE.test(req.params[p] ?? '')) {
        return next(new BadRequestException('Validation failed (uuid is expected)'));
      }
    }
    if (spec.body) {
      const r = spec.body.safeParse(req.body);
      if (!r.success) return next(new BadRequestException({ message: 'Validation failed', issues: r.error.issues }));
      req.body = r.data;
    }
    if (spec.query) {
      const r = spec.query.safeParse(req.query);
      if (!r.success) return next(new BadRequestException({ message: 'Validation failed', issues: r.error.issues }));
      // req.query is a getter on Express 5, so stash the parsed value instead of assigning.
      (req as Request & { valid?: unknown }).valid = r.data;
    }
    next();
  };
}

/** Awaits the handler and serialises its return value, so handlers can just `return` data. */
function send(spec: RouteSpec): RequestHandler {
  const fallback = spec.method === 'post' ? 201 : 200;
  const status = spec.status ?? fallback;
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await spec.handler(req, res);
      if (res.headersSent) return;
      if (status === 204) return res.status(204).end();
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  };
}

/** Parsed query for a route that declared a `query` schema. */
export const validQuery = <T>(req: Request): T => (req as Request & { valid?: T }).valid as T;

export function register(router: Router, specs: RouteSpec[], prefix = ''): Router {
  for (const spec of specs) {
    const fullPath = `${prefix}${spec.path === '/' ? '' : spec.path}` || '/';
    routeRegistry.push({ ...spec, fullPath });
    router[spec.method](spec.path, requirePolicy(spec.policy), ...(spec.middleware ?? []), validate(spec), send(spec));
  }
  return router;
}

/** `prefix` is where the router gets mounted; it only shapes the generated OpenAPI paths. */
export const makeRouter = (specs: RouteSpec[], prefix = ''): Router => register(Router(), specs, prefix);
