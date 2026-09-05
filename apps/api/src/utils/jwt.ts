import jwt, { type SignOptions } from 'jsonwebtoken';

/**
 * Thin promise wrapper over `jsonwebtoken` matching the small slice of the Nest JwtService API the
 * auth service used, so token handling stays identical to the verified implementation.
 */
export const jwtService = {
  signAsync(payload: object, opts: { secret: string; expiresIn: number }): Promise<string> {
    return Promise.resolve(jwt.sign(payload, opts.secret, { expiresIn: opts.expiresIn } as SignOptions));
  },

  verifyAsync<T>(token: string, opts: { secret: string; ignoreExpiration?: boolean }): Promise<T> {
    return Promise.resolve(jwt.verify(token, opts.secret, { ignoreExpiration: opts.ignoreExpiration }) as T);
  },
};

export type JwtService = typeof jwtService;
