import { test, expect } from '../../fixtures/auth.fixture';
import { signIn } from '../../utils/auth.helpers';

/**
 * Session management spec.
 *
 * Tests that the auth guard correctly protects routes, that an active session
 * survives a page reload, and that signing out clears the session.
 */

test.describe('Session management', () => {

  test('should redirect unauthenticated user away from protected route', async ({ page }) => {
    // Directly navigate to a protected dispatcher route without being signed in.
    await page.goto('/(tabs)/trips');

    // The auth guard in app/index.tsx must redirect away from the protected route.
    // On web, unauthenticated visits to / → /terminal-website per the app contract.
    // A visit to /(tabs)/trips while unauthenticated should end up on a public page.
    await expect(page).not.toHaveURL(/\/\(tabs\)\/trips/, { timeout: 15_000 });

    // The user must end up somewhere — either the landing/sign-in or terminal-website.
    const url = page.url();
    const isRedirectedToPublic =
      /sign-in|sign-up|terminal-website/.test(url) ||
      // Expo Router may also redirect to the root index which itself redirects.
      url === 'http://localhost:8081/' ||
      url === 'http://localhost:8081';

    expect(isRedirectedToPublic, `Expected redirect to public page, got: ${url}`).toBe(true);
  });

  test('should auto-login on page refresh when session active', async ({
    page,
    testUser,
    supabaseAdmin,
  }) => {
    // Pre-create user and sign in.
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      user_metadata: {
        role: 'user',
        full_name: testUser.fullName,
        company_name: testUser.companyName,
        phone: `+91${testUser.phone}`,
        operating_model: 'HYBRID',
        city: testUser.city,
        state: testUser.state,
        zone: testUser.zone,
      },
      email_confirm: true,
    });
    expect(error, 'User creation should succeed').toBeNull();

    await signIn(page, { email: testUser.email, password: testUser.password });
    await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });

    // Reload the page — the Supabase session should be persisted in storage
    // and the auth context should restore it without redirecting to sign-in.
    await page.reload();

    // The user must still be on the dashboard after reload, not kicked to sign-in.
    await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });
  });

  test('should clear session on logout', async ({
    page,
    testUser,
    supabaseAdmin,
  }) => {
    // Pre-create and sign in.
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: testUser.email,
      password: testUser.password,
      user_metadata: {
        role: 'user',
        full_name: testUser.fullName,
        company_name: testUser.companyName,
        phone: `+91${testUser.phone}`,
        operating_model: 'HYBRID',
        city: testUser.city,
        state: testUser.state,
        zone: testUser.zone,
      },
      email_confirm: true,
    });
    expect(error).toBeNull();

    await signIn(page, { email: testUser.email, password: testUser.password });
    await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });

    // Navigate to the profile tab to find the sign-out button.
    // Expo Router renders the tab bar on web — look for the Profile tab.
    await page.goto('/(tabs)/profile');
    await page.waitForLoadState('networkidle');

    // Look for a sign-out / logout button. The exact label depends on the profile UI
    // but common patterns are "Sign out", "Log out", "Logout".
    const signOutBtn = page
      .getByRole('button', { name: /sign out|log out|logout/i })
      .or(page.getByText(/sign out|log out|logout/i).first());

    await signOutBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await signOutBtn.click();

    // After sign-out the auth guard should redirect away from protected routes.
    // Acceptable destinations: sign-in, sign-up, terminal-website, or root.
    await expect(page).not.toHaveURL(/\/\(tabs\)\//, { timeout: 15_000 });

    // Attempt to access a protected route again — must be blocked.
    await page.goto('/(tabs)/trips');
    await expect(page).not.toHaveURL(/\/\(tabs\)\/trips/, { timeout: 10_000 });
  });
});
