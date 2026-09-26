import { LoginRequest } from '@billbistro/types';
import { AUTHENTICATED, PUBLIC, makeRouter } from './router';
import { loginRateLimit, refreshRateLimit } from '../middlewares/rate-limit.middleware';
import * as authController from '../controllers/auth.controller';

export const authRoutes = makeRouter(
  [
    {
      method: 'post',
      path: '/login',
      policy: PUBLIC,
      status: 200,
      middleware: [loginRateLimit],
      body: LoginRequest,
      tags: ['auth'],
      summary: 'Sign in with tenant slug + email + password',
      handler: authController.login,
    },
    {
      method: 'post',
      path: '/refresh',
      policy: PUBLIC,
      status: 200,
      middleware: [refreshRateLimit],
      tags: ['auth'],
      summary: 'Rotate the refresh token and issue a new pair',
      handler: authController.refresh,
    },
    {
      method: 'post',
      path: '/logout',
      policy: PUBLIC,
      status: 204,
      tags: ['auth'],
      summary: 'Revoke the refresh token and clear cookies',
      handler: authController.logout,
    },
    {
      method: 'get',
      path: '/me',
      policy: AUTHENTICATED,
      tags: ['auth'],
      summary: 'Current principal (roles + permissions)',
      handler: authController.me,
    },
  ],
  '/v1/auth',
);
