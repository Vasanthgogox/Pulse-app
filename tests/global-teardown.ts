import { createClient } from '@supabase/supabase-js';

/**
 * Global teardown: runs once after the entire suite completes.
 * Deletes all test users whose email matches the test domain pattern
 * `test+*@pulse-e2e.dev`. This is a safety net — individual fixtures
 * already clean up after themselves, but teardown catches anything left
 * behind by aborted/crashed test runs.
 */
async function globalTeardown(): Promise<void> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[global-teardown] Missing env vars — skipping stale user cleanup.');
    return;
  }

  // Service role is required to enumerate and delete auth users.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\n=== Pulse TMS E2E — Global Teardown ===');

  // List users in pages and collect those matching our test email pattern.
  let page = 1;
  const pageSize = 1000;
  const toDelete: string[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) {
      console.error(`[global-teardown] Failed to list users (page ${page}): ${error.message}`);
      break;
    }
    const matched = data.users.filter((u) => /^test\+.+@pulse-e2e\.dev$/i.test(u.email ?? ''));
    toDelete.push(...matched.map((u) => u.id));
    if (data.users.length < pageSize) break;
    page++;
  }

  if (toDelete.length === 0) {
    console.log('  No stale test users found.');
  } else {
    console.log(`  Found ${toDelete.length} stale test user(s) — deleting…`);
    const results = await Promise.allSettled(
      toDelete.map((id) => admin.auth.admin.deleteUser(id)),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`  ${failed.length} deletion(s) failed (may have been cleaned up already).`);
    }
    console.log(`  Deleted ${toDelete.length - failed.length} user(s) successfully.`);
  }

  console.log('========================================\n');
}

export default globalTeardown;
