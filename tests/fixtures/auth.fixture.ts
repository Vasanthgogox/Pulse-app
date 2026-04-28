import { SupabaseClient } from '@supabase/supabase-js';
import { test as base } from '@playwright/test';
import { getAdminClient, deleteUserByEmail } from '../utils/supabase.admin';
import { generateTestUser, generateDriverUser, type TestUserData } from '../utils/test-data.factory';

/**
 * Extended fixture types for auth tests.
 *
 * - `supabaseAdmin` — admin Supabase client (service role). Use for DB assertions only.
 * - `testUser` — freshly generated unique dispatcher user data.
 * - `testDriverUser` — freshly generated unique driver user data.
 *
 * Cleanup is automatic: the fixture deletes both auth users (if created) after
 * each test, regardless of pass/fail. This keeps the test DB clean and avoids
 * "email already registered" failures in subsequent runs.
 */

export interface AuthFixtures {
  supabaseAdmin: SupabaseClient;
  testUser: TestUserData;
  testDriverUser: TestUserData;
}

export const test = base.extend<AuthFixtures>({
  // Provide the admin Supabase client as a fixture so tests don't have to
  // construct it themselves. Scoped per-test so there's no shared state.
  supabaseAdmin: async ({}, use) => {
    const client = getAdminClient();
    await use(client);
  },

  // Generate a unique dispatcher user for this test. The fixture cleans up
  // after itself so tests don't need explicit teardown in afterEach.
  testUser: async ({}, use) => {
    const userData = generateTestUser();
    await use(userData);
    // Cleanup: delete auth user (cascades to profile, org, membership).
    try {
      await deleteUserByEmail(userData.email);
    } catch {
      // Silently ignore — user may never have been created (e.g. test was about validation).
    }
  },

  // Separate driver user fixture; useful for tests that need both roles in one scenario.
  testDriverUser: async ({}, use) => {
    const userData = generateDriverUser();
    await use(userData);
    try {
      await deleteUserByEmail(userData.email);
    } catch {
      // ignore
    }
  },
});

export { expect } from '@playwright/test';
