import { test, expect } from '@playwright/test';
import { SignInPage } from '../../pom/SignInPage';

/**
 * Smoke tests — no auth required.
 * Verify the web app serves correctly and critical pages render without crashing.
 */
test.describe('Smoke', () => {
  test('app serves at base URL', async ({ page }) => {
    const response = await page.goto('/');
    // Expo web is a SPA — response must succeed (2xx/3xx).
    expect(response?.status()).toBeLessThan(400);
    // Confirm the app shell mounts (auth guard redirects to sign-in).
    await expect(page).toHaveURL(/sign-in|\//, { timeout: 15_000 });
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
    await page.goto('/(tabs)/trips');
    // Auth guard in app/index.tsx redirects unauthenticated users to /sign-in.
    await expect(page).toHaveURL(/sign-in|\//, { timeout: 15_000 });
    // The sign-in page should be rendered (email field visible).
    await expect(page.getByPlaceholder('Email Address')).toBeVisible({ timeout: 10_000 });
  });
});
