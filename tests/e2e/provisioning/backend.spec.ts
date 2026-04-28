import { test, expect } from '../../fixtures/auth.fixture';
import { completeSignup } from '../../utils/auth.helpers';
import {
  getUserByEmail,
  getProfileByEmail,
  getOrgByOwnerId,
  getMembershipByUserId,
} from '../../utils/supabase.admin';
import {
  waitForProvisioning,
  waitForProfile,
  retryUntil,
} from '../../utils/retry';
import { generateDriverUser } from '../../utils/test-data.factory';
import { deleteUserByEmail } from '../../utils/supabase.admin';

/**
 * Backend provisioning spec.
 *
 * These tests verify that the DB trigger on auth.users INSERT correctly creates:
 *  - profiles row
 *  - organizations row (dispatcher / role=user only)
 *  - organization_members row (dispatcher only)
 *
 * Tests use the full signup UI flow to exercise the trigger end-to-end.
 * Admin API calls are used only for assertions and cleanup — never for the
 * signup itself, so the trigger path is always exercised.
 */

test.describe('Backend provisioning', () => {

  test('should create profile row with correct fields after signup', async ({
    page,
    testUser,
  }) => {
    await completeSignup(page, testUser);

    // Wait for step 3 success screen before checking DB — the trigger fires
    // after signUp() resolves but the UI advances to step 3 near-simultaneously.
    await expect(page.getByText("You're in")).toBeVisible({ timeout: 15_000 });

    // Poll until the profile row appears (trigger may have a short delay).
    const profile = await waitForProfile(testUser.email, 10_000);

    expect(profile.email).toBe(testUser.email);
    expect(profile.role).toBe('user');
    expect(profile.full_name).toBe(testUser.fullName);

    // Company name must be stored on the profile row.
    expect(profile.company_name).toBe(testUser.companyName);

    // Phone is normalized to E.164 (+91XXXXXXXXXX) by the signup service.
    expect(profile.phone).toBe(`+91${testUser.phone}`);
  });

  test('should create organization row with operating_model, city, state, zone', async ({
    page,
    testUser,
  }) => {
    await completeSignup(page, testUser);
    await expect(page.getByText("You're in")).toBeVisible({ timeout: 15_000 });

    const authUser = await getUserByEmail(testUser.email);
    expect(authUser).not.toBeNull();

    // waitForProvisioning polls until ALL three rows exist or times out at 10s.
    const { org } = await waitForProvisioning(testUser.email, authUser!.id, 10_000);

    expect(org.name).toBe(testUser.companyName);

    // The signup form sets operating model to HYBRID (the "Both" chip is default).
    expect(org.operating_model).toBe('HYBRID');

    // Location fields must match what was selected in the city picker.
    expect(org.city).toBe(testUser.city);       // Mumbai
    expect(org.state).toBe(testUser.state);     // Maharashtra
    expect(org.zone).toBe(testUser.zone);       // WEST
  });

  test('should create organization_members row with role=owner', async ({
    page,
    testUser,
  }) => {
    await completeSignup(page, testUser);
    await expect(page.getByText("You're in")).toBeVisible({ timeout: 15_000 });

    const authUser = await getUserByEmail(testUser.email);
    expect(authUser).not.toBeNull();

    const { membership } = await waitForProvisioning(testUser.email, authUser!.id, 10_000);

    // The account creator must be the org owner.
    expect(membership.role).toBe('owner');
    expect(membership.user_id).toBe(authUser!.id);

    // The membership must reference a valid organization.
    expect(membership.organization_id).toBeTruthy();
  });

  test('should handle provisioning check — retry if trigger is slow', async ({
    page,
    testUser,
  }) => {
    await completeSignup(page, testUser);
    await expect(page.getByText("You're in")).toBeVisible({ timeout: 15_000 });

    const authUser = await getUserByEmail(testUser.email);
    expect(authUser).not.toBeNull();

    // Simulate a "slow trigger" scenario by starting to poll immediately
    // after signup (before the trigger may have run) with tight polling (500ms)
    // over a 10-second window. retryUntil should find the rows once they appear.
    const startMs = Date.now();
    const profile = await retryUntil(
      () => getProfileByEmail(testUser.email),
      {
        timeoutMs: 10_000,
        intervalMs: 500,
        description: `profile for ${testUser.email} (slow trigger simulation)`,
      },
    );
    const elapsedMs = Date.now() - startMs;

    // Profile must eventually appear within the 10s window.
    expect(profile).not.toBeNull();
    expect(profile.email).toBe(testUser.email);

    // Log how long it actually took for observability (not a hard assertion).
    console.log(`  [provisioning] profile appeared after ~${elapsedMs}ms`);

    // Also verify org and membership appeared within the same window.
    const membership = await retryUntil(
      () => getMembershipByUserId(authUser!.id),
      { timeoutMs: 10_000, intervalMs: 500, description: 'membership row' },
    );
    expect(membership).not.toBeNull();

    const org = await retryUntil(
      () => getOrgByOwnerId(authUser!.id),
      { timeoutMs: 10_000, intervalMs: 500, description: 'organization row' },
    );
    expect(org).not.toBeNull();
  });

  test('should NOT create organization for driver signup', async ({
    page,
    supabaseAdmin,
  }) => {
    // Use a fresh driver user — cannot reuse testDriverUser fixture here because
    // we need to access the email for cleanup from within the test.
    const driverUser = generateDriverUser();

    // Driver signup goes through a different route (/driver-signup), but for
    // this provisioning test we create the auth user directly via admin API
    // to exercise the trigger in isolation (the driver-signup page may have
    // different form fields that are out of scope here).
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: driverUser.email,
      password: driverUser.password,
      user_metadata: {
        phone: `+91${driverUser.phone}`,
        role: 'driver',
        full_name: driverUser.fullName,
      },
      email_confirm: true,
    });
    expect(error, 'Driver user creation should succeed').toBeNull();
    expect(created?.user).toBeDefined();

    const userId = created!.user!.id;

    try {
      // Wait for the profile to be provisioned (driver still gets a profile row).
      const profile = await waitForProfile(driverUser.email, 10_000);
      expect(profile.role).toBe('driver');

      // Drivers must NOT have an organization row — the trigger should skip org creation.
      // We wait a generous 3s to ensure the trigger has finished before asserting absence.
      await new Promise((r) => setTimeout(r, 3_000));

      const membership = await getMembershipByUserId(userId);
      expect(
        membership,
        'Drivers should NOT have an organization_members row',
      ).toBeNull();

      const org = await getOrgByOwnerId(userId);
      expect(
        org,
        'Drivers should NOT have an organizations row',
      ).toBeNull();
    } finally {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
  });
});
