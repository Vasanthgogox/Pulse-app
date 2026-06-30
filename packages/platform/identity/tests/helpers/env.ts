import type { IdentityConfig } from '../../src/config';

export const hasIntegrationEnv = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_ANON_KEY &&
  process.env.PULSE_JWT_SECRET,
);

export function loadIntegrationConfig(): IdentityConfig {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.PULSE_JWT_SECRET ?? process.env.JWT_SECRET;

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !jwtSecret) {
    throw new Error('Missing integration test env — see SPRINT1_EXIT_CHECKLIST.md');
  }

  return {
    supabaseUrl,
    supabaseServiceKey,
    supabaseAnonKey,
    jwtSecret,
    jwtIssuer:      process.env.PULSE_JWT_ISSUER,
    jwtAudience:    process.env.PULSE_JWT_AUDUENCE,
    serviceVersion: '1.0.0',
    gitCommit:      process.env.PULSE_GIT_COMMIT,
  };
}
