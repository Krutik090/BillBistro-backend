import type { AuthPrincipal } from './auth.types';

// Augments Express's Request with the principal attached by the auth middleware.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPrincipal;
    }
  }
}

export {};
