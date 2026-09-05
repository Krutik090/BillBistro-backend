/**
 * HTTP errors with the same constructor shapes the services already use, so business logic
 * carries over from the Nest implementation unchanged. A payload object is spread into the
 * response body (e.g. `new ConflictException({ message, expected })`).
 */
export type ErrorPayload = string | Record<string, unknown>;

export class HttpException extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(payload: ErrorPayload, status: number) {
    const body = typeof payload === 'string' ? { message: payload } : payload;
    super(typeof body.message === 'string' ? body.message : 'Error');
    this.status = status;
    this.payload = body;
    this.name = new.target.name;
  }
}

export class BadRequestException extends HttpException {
  constructor(payload: ErrorPayload = 'Bad Request') {
    super(payload, 400);
  }
}
export class UnauthorizedException extends HttpException {
  constructor(payload: ErrorPayload = 'Unauthorized') {
    super(payload, 401);
  }
}
export class ForbiddenException extends HttpException {
  constructor(payload: ErrorPayload = 'Forbidden') {
    super(payload, 403);
  }
}
export class NotFoundException extends HttpException {
  constructor(payload: ErrorPayload = 'Not Found') {
    super(payload, 404);
  }
}
export class ConflictException extends HttpException {
  constructor(payload: ErrorPayload = 'Conflict') {
    super(payload, 409);
  }
}
export class UnprocessableEntityException extends HttpException {
  constructor(payload: ErrorPayload = 'Unprocessable Entity') {
    super(payload, 422);
  }
}

const REASONS: Record<number, string> = {
  200: 'OK',
  201: 'CREATED',
  204: 'NO_CONTENT',
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  423: 'LOCKED',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
};

export const reasonFor = (status: number): string => REASONS[status] ?? 'ERROR';
