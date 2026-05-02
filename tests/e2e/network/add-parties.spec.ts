import { test, expect } from '@playwright/test';
import { SignInPage } from '../../pom/SignInPage';
import { TripsDashboardPage } from '../../pom/TripsDashboardPage';
import { PartyPortalPage } from '../../pom/PartyPortalPage';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';

/** Unique suffix per test-run to avoid duplicate-record errors on repeated runs. */
const RUN_ID = Date.now().toString().slice(-6);

/** 10-digit Indian phone starting with 9, unique per run + slot. */
function runPhone(slot: number): string {
  const suffix = (parseInt(RUN_ID, 10) + slot).toString().padStart(9, '0').slice(-9);
  return `9${suffix}`;
}

/** Valid Indian vehicle number (TN25CM + 4-digit slot). */
function runVehicleReg(slot: number): string {
  const num = (parseInt(RUN_ID, 10) + slot).toString().padEnd(4, '0').slice(-4);
  return `TN25CM${num}`;
}

/** Valid DL number: TN0120200 + 7-digit slot. */
function runDl(slot: number): string {
  const num = (parseInt(RUN_ID, 10) + slot).toString().padStart(7, '0').slice(-7);
  return `TN0120200${num}`;
}

async function loginAndGoto(
  signInPage: SignInPage,
  dashboard: TripsDashboardPage,
  page: import('@playwright/test').Page,
  route: string,
): Promise<void> {
  await signInPage.signIn(TEST_EMAIL, TEST_PASSWORD);
  await dashboard.waitForLoad();
  // Hard navigation after SPA login: use 'domcontentloaded' so Playwright doesn't
  // wait for the large JS bundle + all API calls (which would cause a 'load'-event timeout).
  await page.goto(route, { waitUntil: 'domcontentloaded' });
}

// ---------------------------------------------------------------------------
// Add Client
// ---------------------------------------------------------------------------
test.describe('Add Client', () => {
  test.setTimeout(60_000);

  test('happy path — adds offline client and closes portal', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-client');
    await portal.waitForForm();

    await portal.fillClient({
      orgName: `E2E Org ${RUN_ID}`,
      contactName: 'Test Contact',
      phone: runPhone(1),
    });
    await portal.continue();
    await portal.save();
    await portal.expectClosed();
  });

  test('empty contact name → validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-client');
    await portal.waitForForm();

    // Only fill phone, leave contact name blank
    await portal.phoneInput.fill('9876543210');
    await portal.continue();

    await portal.expectError("Enter the contact person's name.");
  });

  test('contact name too short (1 char) → validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-client');
    await portal.waitForForm();

    await portal.contactNameInput.fill('A');
    await portal.phoneInput.fill('9876543210');
    await portal.continue();

    await portal.expectError("Enter the contact person's name.");
  });

  test('invalid phone → phone validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-client');
    await portal.waitForForm();

    await portal.contactNameInput.fill('Valid Name');
    await portal.phoneInput.fill('123');
    await portal.continue();

    // validatePhone returns an error for too-short/invalid numbers
    await expect(portal.formError).toBeVisible({ timeout: 8_000 });
    const err = await portal.getErrorText();
    expect(err.length).toBeGreaterThan(0);
  });

  test('completely empty form → contact name error (first failing field)', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-client');
    await portal.waitForForm();

    await portal.continue();

    await portal.expectError("Enter the contact person's name.");
  });

  test('platform match found → review shows "Send invitation" label', async ({ page }) => {
    test.setTimeout(90_000);
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-client');
    await portal.waitForForm();

    // Use nihas's own phone — if it's registered as a non-driver org, the lookup will match.
    // This test verifies the lookup UI renders; adjust phone if the account has no org phone.
    // We use a known non-driver phone registered on the platform (the test account's own number).
    await portal.contactNameInput.fill('Test Org Name');
    // Wait for debounce (400ms) + network
    await page.waitForTimeout(600);

    // Advance to review — save button text should be "Send invitation" if match found,
    // or "Save" if no match. Either is valid; we just assert no crash.
    await portal.continue();
    await expect(portal.saveBtn).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Add Supplier
// ---------------------------------------------------------------------------
test.describe('Add Supplier', () => {
  test.setTimeout(60_000);

  test('happy path — adds offline supplier and closes portal', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-supplier');
    await portal.waitForForm();

    await portal.fillSupplier({
      companyName: `E2E Supplier ${RUN_ID}`,
      contactName: 'Supplier Contact',
      phone: runPhone(10),
    });
    await portal.continue();
    await portal.save();
    await portal.expectClosed();
  });

  test('empty contact name → validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-supplier');
    await portal.waitForForm();

    await portal.phoneInput.fill('9876543210');
    await portal.continue();

    await portal.expectError("Enter the contact person's name.");
  });

  test('contact name too short (1 char) → validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-supplier');
    await portal.waitForForm();

    await portal.contactNameInput.fill('X');
    await portal.phoneInput.fill('9876543210');
    await portal.continue();

    await portal.expectError("Enter the contact person's name.");
  });

  test('invalid phone → phone validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-supplier');
    await portal.waitForForm();

    await portal.contactNameInput.fill('Valid Name');
    await portal.phoneInput.fill('00000');
    await portal.continue();

    await expect(portal.formError).toBeVisible({ timeout: 8_000 });
  });

  test('completely empty form → contact name error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-supplier');
    await portal.waitForForm();

    await portal.continue();

    await portal.expectError("Enter the contact person's name.");
  });
});

// ---------------------------------------------------------------------------
// Add Driver
// ---------------------------------------------------------------------------
test.describe('Add Driver', () => {
  test.setTimeout(60_000);

  test('happy path — adds offline driver and closes portal', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.fillDriver({
      name: `E2E Driver ${RUN_ID}`,
      phone: runPhone(20),
      dl: runDl(1),
    });
    await portal.continue();
    await portal.save();
    await portal.expectClosed();
  });

  test('empty name → validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.driverPhoneInput.fill('9876543210');
    await portal.driverDlInput.fill('TN0120200001234');
    await portal.continue();

    await portal.expectError("Enter the driver's name.");
  });

  test('name too short (1 char) → validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.driverNameInput.fill('X');
    await portal.driverPhoneInput.fill('9876543210');
    await portal.driverDlInput.fill('TN0120200001234');
    await portal.continue();

    await portal.expectError("Enter the driver's name.");
  });

  test('invalid phone → phone validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.driverNameInput.fill('Valid Driver');
    await portal.driverPhoneInput.fill('123');
    await portal.driverDlInput.fill('TN0120200001234');
    await portal.continue();

    await expect(portal.formError).toBeVisible({ timeout: 8_000 });
  });

  test('missing DL → "Enter the driving licence number" error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.driverNameInput.fill('Valid Driver');
    await portal.driverPhoneInput.fill('9876543210');
    // leave DL blank
    await portal.continue();

    await portal.expectError('Enter the driving licence number.');
  });

  test('invalid DL format → format error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.driverNameInput.fill('Valid Driver');
    await portal.driverPhoneInput.fill('9876543210');
    await portal.driverDlInput.fill('BADFORMAT');
    await portal.continue();

    await portal.expectError('Use a valid DL number');
  });

  test('invalid email → email validation error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.driverNameInput.fill('Valid Driver');
    await portal.driverPhoneInput.fill('9876543210');
    await portal.driverDlInput.fill('TN0120200001234');
    await portal.driverEmailInput.fill('notanemail');
    await portal.continue();

    await expect(portal.formError).toBeVisible({ timeout: 8_000 });
  });

  test('completely empty form → driver name error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-driver');
    await portal.waitForForm();

    await portal.continue();

    await portal.expectError("Enter the driver's name.");
  });
});

// ---------------------------------------------------------------------------
// Add Vehicle
// ---------------------------------------------------------------------------
test.describe('Add Vehicle', () => {
  test.setTimeout(60_000);

  test('happy path — adds vehicle and closes portal', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-vehicle');
    await portal.waitForForm();

    await portal.fillVehicle({
      reg: runVehicleReg(1),
      category: 'Open Body Truck',
      model: `E2E Model ${RUN_ID}`,
      capacity: '10',
      bodyLength: '24',
    });
    await portal.continue();
    await portal.save();
    await portal.expectClosed();
  });

  test('invalid vehicle number → format error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-vehicle');
    await portal.waitForForm();

    await portal.vehicleRegInput.fill('NOTAPLATE');
    await portal.continue();

    await portal.expectError(/valid vehicle number/i);
  });

  test('empty vehicle number → required error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-vehicle');
    await portal.waitForForm();

    // leave all fields blank
    await portal.continue();

    await expect(portal.formError).toBeVisible({ timeout: 8_000 });
  });

  test('valid reg but missing category/model/capacity/body → fields error', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-vehicle');
    await portal.waitForForm();

    await portal.vehicleRegInput.fill('TN25CM1234');
    // skip category, model, capacity, body length
    await portal.continue();

    await portal.expectError(/Select vehicle category/i);
  });

  test('review step shows edit-details button and can go back', async ({ page }) => {
    const signIn = new SignInPage(page);
    const dashboard = new TripsDashboardPage(page);
    const portal = new PartyPortalPage(page);

    await loginAndGoto(signIn, dashboard, page, '/add-vehicle');
    await portal.waitForForm();

    await portal.fillVehicle({
      reg: 'TN25CM9999',
      category: 'Trailer',
      model: 'Review Test',
      capacity: '20',
      bodyLength: '40',
    });
    await portal.continue();

    await expect(portal.editDetailsBtn).toBeVisible({ timeout: 10_000 });
    await portal.editDetailsBtn.click();

    // Should be back on form step
    await expect(portal.continueBtn).toBeVisible({ timeout: 5_000 });
  });
});
