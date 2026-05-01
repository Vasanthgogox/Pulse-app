import { test, expect } from '../../fixtures/auth.fixture';
import { SignInPage } from '../../pom/SignInPage';
import { TripsDashboardPage } from '../../pom/TripsDashboardPage';
import { DriverDashboardPage } from '../../pom/DriverDashboardPage';

/**
 * Login tests — business (dispatcher) and driver — using Page Object Model.
 * Users are pre-created via the Supabase admin API so tests focus on the
 * sign-in flow itself, not the signup wizard.
 */
test.describe('Login', () => {
  test.describe('Business (dispatcher) user', () => {
    test('signs in and lands on trips dashboard', async ({
      page,
      testUser,
      supabaseAdmin,
    }) => {
      const { error } = await supabaseAdmin.auth.admin.createUser({
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

      const signInPage = new SignInPage(page);
      const dashboard = new TripsDashboardPage(page);

      await signInPage.signIn(testUser.email, testUser.password);
      await dashboard.waitForLoad();

      expect(await dashboard.isLoaded()).toBe(true);
    });

    test('shows error for wrong password', async ({
      page,
      testUser,
      supabaseAdmin,
    }) => {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        user_metadata: { role: 'user', full_name: testUser.fullName },
        email_confirm: true,
      });
      expect(error).toBeNull();

      const signInPage = new SignInPage(page);
      await signInPage.signIn(testUser.email, 'WrongPassword999!');

      await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Driver user', () => {
    test('signs in and lands on driver dashboard', async ({
      page,
      testDriverUser,
      supabaseAdmin,
    }) => {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: testDriverUser.email,
        password: testDriverUser.password,
        user_metadata: {
          phone: `+91${testDriverUser.phone}`,
          role: 'driver',
          full_name: testDriverUser.fullName,
        },
        email_confirm: true,
      });
      expect(error, 'Admin driver creation should succeed').toBeNull();

      const signInPage = new SignInPage(page);
      const driverDash = new DriverDashboardPage(page);

      await signInPage.signIn(testDriverUser.email, testDriverUser.password);
      await driverDash.waitForLoad();

      expect(await driverDash.isLoaded()).toBe(true);
    });

    test('shows error for wrong password', async ({
      page,
      testDriverUser,
      supabaseAdmin,
    }) => {
      const { error } = await supabaseAdmin.auth.admin.createUser({
        email: testDriverUser.email,
        password: testDriverUser.password,
        user_metadata: { role: 'driver', full_name: testDriverUser.fullName },
        email_confirm: true,
      });
      expect(error).toBeNull();

      const signInPage = new SignInPage(page);
      await signInPage.signIn(testDriverUser.email, 'BadPass123!');

      await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Validation', () => {
    // Supabase can be slow to respond in headed/parallel mode; 60s keeps these reliable.
    test.setTimeout(60_000);

    test('shows error when submitting empty form', async ({ page }) => {
      const signInPage = new SignInPage(page);
      await signInPage.goto();
      await signInPage.waitForReady();
      await signInPage.submit();

      await expect(page.getByText(/enter email and password/i)).toBeVisible({ timeout: 10_000 });
    });

    test('shows error for non-existent email', async ({ page, testUser }) => {
      // Use a unique email so the address is never rate-limited by Supabase across runs.
      // We deliberately do NOT create this user — the goal is to test the not-found path.
      const signInPage = new SignInPage(page);
      await signInPage.signIn(testUser.email, 'AnyPassword123!');

      // Supabase intentionally delays the error response for non-existent users.
      await expect(page.getByText(/incorrect email or password/i)).toBeVisible({ timeout: 25_000 });
    });
  });
});
