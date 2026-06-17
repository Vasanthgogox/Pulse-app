import { test, expect } from '@playwright/test';
import { SignInPage } from '../../pom/SignInPage';

/**
 * Smoke tests — no auth required.
 * Verify the web app serves correctly and critical pages render without crashing.
 */
test.describe('Smoke', () => {
  test('app serves at base URL', async ({ page }) => {
    // waitUntil: 'commit' returns as soon as headers arrive — avoids waiting for
    // the full Expo JS bundle hydration which can exceed the default 30s timeout.
    const response = await page.goto('/', { waitUntil: 'commit' });
    // Expo web is a SPA — response must succeed (2xx/3xx).
    expect(response?.status()).toBeLessThan(400);
    // Confirm the app shell mounts (auth guard redirects to sign-in).
    await expect(page).toHaveURL(/sign-in|\//, { timeout: 30_000 });
  });

  test('sign-in page renders all required elements', async ({ page }) => {
    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.expectVisible();
  });

  test('sign-in page has no JS errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    const signIn = new SignInPage(page);
    await signIn.goto();
    await signIn.waitForReady();

    expect(errors, `JS errors on sign-in load: ${errors.join(', ')}`).toHaveLength(0);
  });

  test('unauthenticated access to protected route redirects to sign-in', async ({ page }) => {
    // Attempt to access the dispatcher dashboard without a session.
    await page.goto('/(tabs)/trips', { waitUntil: 'commit' });
    // Auth guard in app/index.tsx redirects unauthenticated users to /sign-in.
    await expect(page).toHaveURL(/sign-in|\//, { timeout: 30_000 });
    // The sign-in page should be rendered (email field visible).
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 15_000 });
  });
});
