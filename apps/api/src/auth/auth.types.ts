export interface AuthPrincipal {
  userId: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

/** Access-token claims (short-lived). */
export interface AccessClaims {
  sub: string;
  tid: string;
  roles: string[];
  perms: string[];
}

/** Refresh-token claims (rotating, stored hashed in refresh_tokens). */
export interface RefreshClaims {
  sub: string;
  tid: string;
  jti: string;
}

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
