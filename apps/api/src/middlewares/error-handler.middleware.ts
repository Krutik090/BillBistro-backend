import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { HttpException, NotFoundException, reasonFor } from '../utils/errors';
import { currentContext } from '../context/tenant-context';

/**
 * Single response shape for every error; never leaks stack traces / SQL / internals.
 * Prisma known errors map to HTTP codes; anything unknown is a 500 carrying a request id.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = currentContext()?.requestId ?? (req.headers['x-request-id'] as string) ?? undefined;

  let status = 500;
  let body: Record<string, unknown> = { message: 'Internal server error' };

  if (err instanceof HttpException) {
    status = err.status;
    body = { ...err.payload };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        status = 409;
        body = { message: 'Duplicate value', target: (err.meta as { target?: unknown })?.target };
        break;
      case 'P2025':
        status = 404;
        body = { message: 'Not found' };
        break;
      case 'P2003':
        status = 422;
        body = { message: 'Related record not found' };
        break;
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    body = { message: 'Invalid query' };
  }

  if (status >= 500) {
    console.error(
      `[Http] ${req.method} ${req.originalUrl} -> ${status} tenant=${currentContext()?.tenantId ?? '-'} rid=${requestId ?? '-'}`,
      err instanceof Error ? err.stack : String(err),
    );
  }
  res.status(status).json({ statusCode: status, error: reasonFor(status), ...body, requestId, path: req.originalUrl });
}

/** Unmatched route → the same error shape as everything else. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundException(`Cannot ${req.method} ${req.originalUrl}`));
}
