import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { currentContext } from '../tenancy/tenant-context';

/**
 * Single response shape for every error; never leaks stack traces / SQL / internals.
 * Prisma known errors are mapped to HTTP codes; everything unknown is a 500 with a request id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = currentContext()?.requestId ?? (req.headers['x-request-id'] as string) ?? undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      body = typeof r === 'string' ? { message: r } : { ...(r as Record<string, unknown>) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          body = { message: 'Duplicate value', target: (exception.meta as { target?: unknown })?.target };
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          body = { message: 'Not found' };
          break;
        case 'P2003':
          status = HttpStatus.UNPROCESSABLE_ENTITY;
          body = { message: 'Related record not found' };
          break;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      body = { message: 'Invalid query' };
    }

    if (status >= 500) {
      this.log.error(
        `${req.method} ${req.url} -> ${status} tenant=${currentContext()?.tenantId ?? '-'} rid=${requestId ?? '-'}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    res.status(status).json({ statusCode: status, error: HttpStatus[status], ...body, requestId, path: req.url });
  }
}
