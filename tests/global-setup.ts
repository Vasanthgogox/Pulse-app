import { createClient } from '@supabase/supabase-js';

/**
 * Global setup: runs once before the entire test suite.
 * Validates that required env vars are present and Supabase is reachable.
 * Fails fast so tests never run against a broken environment.
 */
async function globalSetup(): Promise<void> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('\n=== Pulse TMS E2E — Global Setup ===');
  console.log(`  EXPO_PUBLIC_SUPABASE_URL   : ${supabaseUrl ? supabaseUrl.replace(/^(https?:\/\/[^.]+).*$/, '$1…') : '❌ MISSING'}`);
  console.log(`  EXPO_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓ set' : '❌ MISSING'}`);
  console.log(`  SUPABASE_SERVICE_ROLE_KEY  : ${serviceRoleKey ? '✓ set' : '❌ MISSING'}`);

  if (!supabaseUrl) {
    throw new Error('[global-setup] EXPO_PUBLIC_SUPABASE_URL is not set. Add it to your .env file.');
  }
  if (!supabaseAnonKey) {
    throw new Error('[global-setup] EXPO_PUBLIC_SUPABASE_ANON_KEY is not set.');
  }
  if (!serviceRoleKey) {
    throw new Error(
      '[global-setup] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
        'This is required for test user cleanup. Never use service role in production code.',
    );
  }

  // Verify Supabase connectivity with a lightweight health check.
  // We use the anon key so no special permissions are needed.
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { error } = await client.from('profiles').select('id').limit(1);

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows — that is fine. Any other error signals a connectivity problem.
    throw new Error(`[global-setup] Supabase health check failed: ${error.message} (code: ${error.code})`);
  }

  console.log('  Supabase connection         : ✓ reachable');
  console.log('  Base URL                    : http://localhost:8081');
  console.log('=====================================\n');
}

export default globalSetup;
