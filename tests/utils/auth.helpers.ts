import { expect, Page } from '@playwright/test';
import type { TestUserData } from './test-data.factory';

// ─── Sign-up step helpers ──────────────────────────────────────────────────────

/**
 * Step 0 — Phone.
 * Fills the phone input and clicks "Continue" (step 0's button = nth(0)).
 */
export async function fillPhoneStep(page: Page, phone: string): Promise<void> {
  const phoneInput = page.getByPlaceholder('000 000 0000');
  await phoneInput.waitFor({ state: 'visible', timeout: 15_000 });
  await phoneInput.fill(phone);
  // Let the React debounce settle before clicking.
  await page.waitForTimeout(300);
  // All 4 steps are in the DOM simultaneously (horizontal ScrollView).
  // "Continue" buttons: step 0 = nth(0), step 1 = nth(1).
  await page.getByRole('button', { name: 'Continue' }).nth(0).click();
}

/**
 * Step 1 — Business details.
 * City picker is a Modal: tap the trigger → type in modal search → select city.
 * Modal closes automatically on selection; then click Continue (nth(1)).
 */
export async function fillBusinessStep(
  page: Page,
  opts: { fullName: string; companyName: string; city: string },
): Promise<void> {
  const { fullName, companyName, city } = opts;

  const nameInput = page.getByPlaceholder('Your name');
  await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
  await nameInput.fill(fullName);

  await page.getByPlaceholder('Company').fill(companyName);
  // Wait for the duplicate-name debounce (600 ms) to settle.
  await page.waitForTimeout(800);

  // ── City picker is a Modal, NOT an inline input ──────────────────────────
  // The trigger shows text "Search & select city" (until a city is selected).
  // Clicking it sets cityPickerOpen=true and opens the Modal.
  const cityTrigger = page.getByText('Search & select city');
  await cityTrigger.waitFor({ state: 'visible', timeout: 8_000 });
  await cityTrigger.click();

  // The Modal contains a TextInput with placeholder="Search city or state...".
  const citySearchInput = page.getByPlaceholder('Search city or state...');
  await citySearchInput.waitFor({ state: 'visible', timeout: 8_000 });
  await citySearchInput.fill(city);
  await page.waitForTimeout(350); // let useMemo filter settle

  // Click the first FlatList item whose city text matches exactly.
  // Each row renders: city name (stateItemText) + state (stateZoneBadge).
  // We scope to the modal content area to avoid matching other page text.
  const cityItem = page.getByText(city).first();
  await cityItem.waitFor({ state: 'visible', timeout: 6_000 });
  await cityItem.click();
  // Modal closes automatically (setCityPickerOpen(false) + setCitySearch(''))

  // Step 1's Continue button is nth(1) in DOM order (after step 0's button).
  await page.getByRole('button', { name: 'Continue' }).nth(1).click();
}

/**
 * Step 2 — Email + password.
 */
export async function fillCredentialsStep(
  page: Page,
  opts: { email: string; password: string },
): Promise<void> {
  const { email, password } = opts;

  const emailInput = page.getByPlaceholder('you@example.com');
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(email);

  await page.getByPlaceholder('At least 6 characters').fill(password);
  await page.getByPlaceholder('Re-enter password').fill(password);

  await page.getByRole('button', { name: 'Create account' }).click();
}

/**
 * Runs all three sign-up steps end-to-end.
 */
export async function completeSignup(page: Page, userData: TestUserData): Promise<void> {
  await page.goto('/sign-up');
  await fillPhoneStep(page, userData.phone);
  await fillBusinessStep(page, {
    fullName: userData.fullName,
    companyName: userData.companyName,
    city: userData.city,
  });
  await fillCredentialsStep(page, { email: userData.email, password: userData.password });
}

// ─── Sign-in helper ────────────────────────────────────────────────────────────

/**
 * Navigates to `/sign-in?direct=1` (skip landing screen) and submits credentials.
 * On invalid credentials Supabase sets signInError inline — no dialog involved.
 */
export async function signIn(
  page: Page,
  opts: { email: string; password: string },
): Promise<void> {
  await page.goto('/sign-in?direct=1');

  const emailInput = page.getByPlaceholder('Email Address');
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(opts.email);

  await page.getByPlaceholder('Your Password').fill(opts.password);
  await page.getByRole('button', { name: /Enter Dashboard/i }).click();
}

// ─── Navigation assertions ────────────────────────────────────────────────────

export async function waitForDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/(\/\(tabs\)\/trips|\/\(driver\))/, { timeout: 20_000 });
}

export async function waitForTripsDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });
}

/**
 * Driver root route is '/(driver)' (no trailing slash) per lib/routes.ts.
 * Expo Router may append a slash when resolving the group; match both.
 */
export async function waitForDriverDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/\(driver\)/, { timeout: 20_000 });
}

// ─── Alert.alert dialog utility ───────────────────────────────────────────────

/**
 * React Native Web maps Alert.alert → window.alert (or window.confirm for 2-btn).
 * Playwright surfaces these as 'dialog' events — they do NOT appear in the DOM.
 *
 * Usage:
 *   const msg = await clickAndAcceptDialog(page, () =>
 *     page.getByRole('button', { name: 'Continue' }).nth(1).click()
 *   );
 *   expect(msg).toMatch(/select your city/i);
 */
export async function clickAndAcceptDialog(
  page: Page,
  triggerFn: () => Promise<void>,
): Promise<string> {
  const [dialog] = await Promise.all([
    page.waitForEvent('dialog', { timeout: 8_000 }),
    triggerFn(),
  ]);
  const message = dialog.message();
  await dialog.accept();
  return message;
}
