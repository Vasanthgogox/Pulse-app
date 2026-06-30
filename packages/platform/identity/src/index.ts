import { Hono } from 'hono';
import { observabilityMiddleware, enrichRequestContextFromClaims } from '@pulse/platform-observability';
import type { IdentityConfig, AuthContext } from './config';
import type { IdentityEnv } from './hono-env';
import { registerAuthRoutes } from './api/auth.routes';
import { registerOrganizationRoutes } from './api/organizations.routes';
import { registerBusinessUnitRoutes } from './api/business-units.routes';
import { registerWarehouseRoutes } from './api/warehouses.routes';
import { registerInvitationRoutes } from './api/invitations.routes';
import { registerHealthRoutes } from './api/health.routes';

export function loadIdentityConfig(): IdentityConfig {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.PULSE_JWT_SECRET ?? process.env.JWT_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !jwtSecret) {
    throw new Error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, or PULSE_JWT_SECRET');
  }

  return {
    supabaseUrl,
    supabaseServiceKey,
    supabaseAnonKey,
    jwtSecret,
    jwtIssuer:      process.env.PULSE_JWT_ISSUER,
    jwtAudience:    process.env.PULSE_JWT_AUDIENCE,
    serviceVersion: process.env.npm_package_version ?? '1.0.0',
    gitCommit:      process.env.PULSE_GIT_COMMIT ?? process.env.GIT_COMMIT,
  };
}

export function createIdentityApp(config: IdentityConfig): Hono<IdentityEnv> {
  const app = new Hono<IdentityEnv>();

  app.use('*', observabilityMiddleware({ service: 'identity' }));

  app.use('*', async (c, next) => {
    const reqCtx = c.get('reqCtx');
    c.set('auth', { requestId: reqCtx.requestId } satisfies AuthContext);
    await next();
  });

  registerHealthRoutes(app, config);
  registerAuthRoutes(app, config);
  registerOrganizationRoutes(app, config);
  registerBusinessUnitRoutes(app, config);
  registerWarehouseRoutes(app, config);
  registerInvitationRoutes(app, config);

  return app;
}

export { enrichRequestContextFromClaims };
export { createIdentityApp as default };
export type { IdentityConfig } from './config';
