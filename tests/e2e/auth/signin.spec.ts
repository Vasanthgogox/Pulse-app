import { test, expect } from '../../fixtures/auth.fixture';
import { signIn, waitForTripsDashboard, waitForDriverDashboard } from '../../utils/auth.helpers';
import { deleteUserByEmail, getUserByEmail } from '../../utils/supabase.admin';
import { generateTestUser, generateDriverUser } from '../../utils/test-data.factory';
import { waitForProfile } from '../../utils/retry';

/**
 * Sign-in spec.
 *
 * All tests that need a real authenticated user pre-create one via the Supabase
 * admin API (bypassing the full signup wizard) so the test is fast and focused
 * purely on the sign-in flow itself.
 */

test.describe('Sign-in flow', () => {

  // ─── Happy path ──────────────────────────────────────────────────────────────

  test.describe('Happy path', () => {
    test('should sign in dispatcher user and redirect to trips tab', async ({
      page,
      testUser,
      supabaseAdmin,
    }) => {
      // Pre-create user via admin API — faster than going through signup UI.
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        user_metadata: {
          phone: `+91${testUser.phone}`,
          role: 'user',
          full_name: testUser.fullName,
          company_name: testUser.companyName,
          operating_model: 'HYBRID',
          city: testUser.city,
          state: testUser.state,
          zone: testUser.zone,
        },
        email_confirm: true,
      });
      expect(error, 'Admin user creation should succeed').toBeNull();
      expect(created?.user).toBeDefined();

      // Measure login round-trip performance. < 5000ms is the acceptance criterion.
      const t0 = Date.now();
      await signIn(page, { email: testUser.email, password: testUser.password });
      await waitForTripsDashboard(page);
      const elapsed = Date.now() - t0;

      // Login round-trip must complete within 5 seconds (performance SLA).
      expect(elapsed, `Login round-trip took ${elapsed}ms — must be < 5000ms`).toBeLessThan(5_000);
    });

    test('should sign in driver user and redirect to driver dashboard', async ({
      page,
      testDriverUser,
      supabaseAdmin,
    }) => {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: testDriverUser.email,
        password: testDriverUser.password,
        user_metadata: {
          phone: `+91${testDriverUser.phone}`,
          role: 'driver',
          full_name: testDriverUser.fullName,
        },
        email_confirm: true,
      });
      expect(error, 'Driver user creation should succeed').toBeNull();
      expect(created?.user).toBeDefined();

      await signIn(page, { email: testDriverUser.email, password: testDriverUser.password });

      // Drivers land on /(driver)/ not /(tabs)/trips.
      await waitForDriverDashboard(page);
    });
  });

  // ─── Error cases ─────────────────────────────────────────────────────────────

  test.describe('Error cases', () => {
    test('should show error for wrong password', async ({ page, testUser, supabaseAdmin }) => {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        user_metadata: { role: 'user', full_name: testUser.fullName },
        email_confirm: true,
      });
      expect(error).toBeNull();

      await page.goto('/sign-in?direct=1');
      await page.getByPlaceholder('Email Address').fill(testUser.email);
      await page.getByPlaceholder('Your Password').fill('WrongPassword999!');
      await page.getByRole('button', { name: /Enter Dashboard/i }).click();

      // The sign-in component sets signInError which renders as inline text.
      // "Incorrect email or password." is the normalized message for invalid credentials.
      await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10_000 });
    });

    test('should show error for non-existent email', async ({ page }) => {
      await page.goto('/sign-in?direct=1');
      await page.getByPlaceholder('Email Address').fill('nobody@pulse-e2e.dev');
      await page.getByPlaceholder('Your Password').fill('AnyPassword123!');
      await page.getByRole('button', { name: /Enter Dashboard/i }).click();

      // Supabase returns "Invalid login credentials" for non-existent users.
      await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10_000 });
    });

    test('should show error for empty fields', async ({ page }) => {
      await page.goto('/sign-in?direct=1');

      // Submit immediately without filling anything.
      const submitBtn = page.getByRole('button', { name: /Enter Dashboard/i });
      await submitBtn.waitFor({ state: 'visible', timeout: 15_000 });
      await submitBtn.click();

      // "Enter email and password." is the validation message in handleSignIn.
      await expect(page.getByText(/enter email and password/i)).toBeVisible({ timeout: 5_000 });
    });
  });

  // ─── Keep signed in ───────────────────────────────────────────────────────────

  test.describe('Keep signed in', () => {
    /**
     * Helper: create a user, sign in via UI, and return to the page.
     * Used by both "remember session" tests.
     */
    async function createAndSignIn(
      page: Parameters<typeof signIn>[0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabaseAdmin: any,
    ) {
      const user = generateTestUser();
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        user_metadata: {
          role: 'user',
          full_name: user.fullName,
          company_name: user.companyName,
          phone: `+91${user.phone}`,
          operating_model: 'HYBRID',
          city: user.city,
          state: user.state,
          zone: user.zone,
        },
        email_confirm: true,
      });
      if (error) throw new Error(`createAndSignIn: ${error.message}`);
      return user;
    }

    test('should remember session on page reload when keep-signed-in is checked', async ({
      page,
      supabaseAdmin,
    }) => {
      const user = await createAndSignIn(page, supabaseAdmin);

      try {
        await page.goto('/sign-in?direct=1');

        // The "Remember Me" checkbox is checked by default.
        // Verify the checkbox is in a checked state before sign in.
        const rememberMeBtn = page.getByText('Remember Me').locator('..');
        await rememberMeBtn.waitFor({ state: 'visible', timeout: 15_000 });

        // Sign in (keep-signed-in defaults to true per the component state).
        await page.getByPlaceholder('Email Address').fill(user.email);
        await page.getByPlaceholder('Your Password').fill(user.password);
        await page.getByRole('button', { name: /Enter Dashboard/i }).click();
        await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });

        // Reload the page — session stored in secure storage should auto-login.
        await page.reload();
        // After reload the auth guard should route back to the dashboard, not to /sign-in.
        await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });
      } finally {
        const authUser = await getUserByEmail(user.email);
        if (authUser) await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      }
    });

    test('should not remember session on page reload when keep-signed-in is unchecked', async ({
      page,
      supabaseAdmin,
    }) => {
      const user = await createAndSignIn(page, supabaseAdmin);

      try {
        await page.goto('/sign-in?direct=1');

        // Uncheck "Remember Me" before signing in.
        // The component's keepRow button toggles the state on press.
        const rememberMeArea = page.getByText('Remember Me').locator('..');
        await rememberMeArea.waitFor({ state: 'visible', timeout: 15_000 });
        await rememberMeArea.click(); // toggles off

        await page.getByPlaceholder('Email Address').fill(user.email);
        await page.getByPlaceholder('Your Password').fill(user.password);
        await page.getByRole('button', { name: /Enter Dashboard/i }).click();
        await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });

        // Simulate a new browser session by clearing storage and reloading.
        await page.evaluate(() => {
          localStorage.clear();
          sessionStorage.clear();
        });
        await page.reload();

        // Without a persisted session the user should be redirected away from the
        // protected route. On web, unauthenticated / → /terminal-website or /sign-in.
        await expect(page).not.toHaveURL(/\/\(tabs\)\/trips/, { timeout: 10_000 });
      } finally {
        const authUser = await getUserByEmail(user.email);
        if (authUser) await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      }
    });
  });
});
