import type { Context, Next } from 'hono';
import type { IdentityEnv } from '../hono-env';
import { Permission, roleHasPermission, type PlatformRole } from '@pulse/contracts';
import type { AuthContext } from '../config';

export function authorize(required: Permission) {
  return async (c: Context<IdentityEnv>, next: Next) => {
    const auth = c.get('auth') as AuthContext;
    const role = auth.platformClaims?.role as PlatformRole | undefined;

    if (!role) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Platform session required' } }, 403);
    }

    if (!roleHasPermission(role, required)) {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: `Missing permission: ${required}` },
      }, 403);
    }

    return next();
  };
}

/** Bootstrap endpoints before platform JWT — allow Supabase auth + admin membership check in service */
export function authorizeBootstrap() {
  return async (c: Context<IdentityEnv>, next: Next) => {
    const auth = c.get('auth') as AuthContext;
    if (!auth.authUserId) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
    }
    return next();
  };
}
