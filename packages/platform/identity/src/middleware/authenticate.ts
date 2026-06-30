import type { Context, Next } from 'hono';
import { enrichRequestContextFromClaims } from '@pulse/platform-observability';
import type { AuthContext, IdentityConfig } from '../config';
import type { IdentityEnv } from '../hono-env';
import { AuthService } from '../services/auth.service';
import { PlatformError } from '@pulse/contracts';

export function authenticate(config: IdentityConfig) {
  const authService = new AuthService(config);

  return async (c: Context<IdentityEnv>, next: Next) => {
    const auth = c.get('auth') as AuthContext;
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing bearer token' } }, 401);
    }

    const token = header.slice(7);

    try {
      const resolved = await authService.resolveBearerToken(token);
      auth.authUserId = resolved.authUserId;
      auth.email = resolved.email;
      auth.platformClaims = resolved.platformClaims;
      enrichRequestContextFromClaims(c.get('reqCtx'), resolved.platformClaims);
      return next();
    } catch (err) {
      const message = err instanceof PlatformError ? err.message : 'Invalid token';
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message } }, 401);
    }
  };
}

/** Optional auth — sets context when present, does not fail */
export function optionalAuthenticate(config: IdentityConfig) {
  return async (c: Context<IdentityEnv>, next: Next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) return next();
    return authenticate(config)(c, next);
  };
}
