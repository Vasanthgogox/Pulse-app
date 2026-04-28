import { test, expect } from '../../fixtures/auth.fixture';
import {
  fillPhoneStep,
  fillBusinessStep,
  fillCredentialsStep,
  completeSignup,
  clickAndAcceptDialog,
} from '../../utils/auth.helpers';
import { waitForProvisioning } from '../../utils/retry';
import { getUserByEmail } from '../../utils/supabase.admin';
import { generateTestUser } from '../../utils/test-data.factory';

test.describe('Sign-up flow', () => {

  // ─── Happy path ─────────────────────────────────────────────────────────────

  test.describe('Happy path', () => {
    test('should complete full signup for dispatcher role', async ({ page, testUser, supabaseAdmin }) => {
      await completeSignup(page, testUser);

      // Step 3: success screen must appear before redirect.
      await expect(page.getByText("You're in")).toBeVisible({ timeout: 15_000 });

      // Navigate to app.
      await page.getByRole('button', { name: 'Go to app' }).click();

      // Auth guard should redirect dispatcher (role=user) to trips tab.
      await expect(page).toHaveURL(/\/\(tabs\)\/trips/, { timeout: 20_000 });

      // Verify DB provisioning — profile, org, and membership must all exist.
      const authUser = await getUserByEmail(testUser.email);
      expect(authUser, 'Auth user should exist in Supabase after signup').not.toBeNull();

      const provisioned = await waitForProvisioning(testUser.email, authUser!.id, 10_000);

      // Profile assertions
      expect(provisioned.profile.email).toBe(testUser.email);
      expect(provisioned.profile.role).toBe('user');
      expect(provisioned.profile.full_name).toBe(testUser.fullName);
      expect(provisioned.profile.company_name).toBe(testUser.companyName);
      // Phone stored as +91XXXXXXXXXX
      expect(provisioned.profile.phone).toBe(`+91${testUser.phone}`);

      // Org assertions
      expect(provisioned.org.city).toBe(testUser.city);
      expect(provisioned.org.state).toBe(testUser.state);
      expect(provisioned.org.zone).toBe(testUser.zone);

      // Membership role must be 'owner' for the account creator.
      expect(provisioned.membership.role).toBe('owner');
      expect(provisioned.membership.user_id).toBe(authUser!.id);
    });

    test('should show success screen (step 3) before redirect', async ({ page, testUser }) => {
      await completeSignup(page, testUser);

      // The "You're in" heading is the unambiguous signal that step 3 rendered.
      const successHeading = page.getByText("You're in");
      await expect(successHeading).toBeVisible({ timeout: 15_000 });

      // "Go to app" button must be present and actionable on the success screen.
      await expect(page.getByRole('button', { name: 'Go to app' })).toBeVisible();
    });
  });

  // ─── Validation / error cases ────────────────────────────────────────────────

  test.describe('Validation', () => {
    test('should block continue on step 0 with empty phone', async ({ page }) => {
      await page.goto('/sign-up');
      const continueBtn = page.getByRole('button', { name: 'Continue' }).first();
      await continueBtn.waitFor({ state: 'visible', timeout: 15_000 });

      // Button is disabled when phone is empty — verify it is not clickable.
      await expect(continueBtn).toBeDisabled();
    });

    test('should block continue on step 0 with invalid phone', async ({ page }) => {
      await page.goto('/sign-up');
      const phoneInput = page.getByPlaceholder('000 000 0000');
      await phoneInput.waitFor({ state: 'visible', timeout: 15_000 });

      // 9-digit number: valid first digit but too short.
      await phoneInput.fill('123456789');

      // Continue button must remain disabled for an invalid phone.
      const continueBtn = page.getByRole('button', { name: 'Continue' }).first();
      await expect(continueBtn).toBeDisabled();

      // Inline error message must also be visible (after user has typed something).
      await expect(page.getByText(/valid 10-digit/i)).toBeVisible();
    });

    test('should show error for duplicate phone', async ({ page, testUser, supabaseAdmin }) => {
      const existingPhone = testUser.phone;
      const preExistingUser = generateTestUser();
      const overrideUser = { ...preExistingUser, phone: existingPhone };

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: overrideUser.email,
        password: overrideUser.password,
        user_metadata: {
          phone: `+91${existingPhone}`,
          role: 'user',
          full_name: overrideUser.fullName,
        },
        email_confirm: true,
      });
      expect(createErr, 'Pre-create user should succeed').toBeNull();

      try {
        await page.goto('/sign-up');
        const phoneInput = page.getByPlaceholder('000 000 0000');
        await phoneInput.waitFor({ state: 'visible', timeout: 15_000 });
        await phoneInput.fill(existingPhone);

        // Wait for the debounced phone-exists API call (600ms + network).
        await page.waitForTimeout(1_500);

        // The hint "already registered" should appear inline.
        await expect(page.getByText(/already registered/i)).toBeVisible({ timeout: 8_000 });

        // Clicking Continue triggers an alert dialog (Alert.alert on RN Web = window.alert).
        const msg = await clickAndAcceptDialog(
          page,
          () => page.getByRole('button', { name: 'Continue' }).first().click(),
        );
        expect(msg).toMatch(/already (registered|exists)/i);
      } finally {
        if (created?.user?.id) {
          await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        }
      }
    });

    test('should block step 1 without selecting city', async ({ page, testUser }) => {
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);

      // Fill name and company but deliberately skip city selection.
      const nameInput = page.getByPlaceholder('Your name');
      await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
      await nameInput.fill(testUser.fullName);
      await page.getByPlaceholder('Company').fill(testUser.companyName);
      await page.waitForTimeout(800);

      // Clicking Continue on step 1 without a city should trigger Alert.alert
      // which React Native Web maps to window.alert() → Playwright dialog event.
      const msg = await clickAndAcceptDialog(
        page,
        () => page.getByRole('button', { name: 'Continue' }).nth(1).click(),
      );
      expect(msg).toMatch(/select your city/i);
    });

    test('should block step 2 with weak password', async ({ page, testUser }) => {
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);
      await fillBusinessStep(page, {
        fullName: testUser.fullName,
        companyName: testUser.companyName,
        city: testUser.city,
      });

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
      await emailInput.fill(testUser.email);

      // 5 characters — below the 6-character minimum.
      await page.getByPlaceholder('At least 6 characters').fill('Abc1!');
      await page.getByPlaceholder('Re-enter password').fill('Abc1!');

      // Validation triggers Alert.alert → window.alert → Playwright dialog.
      const msg = await clickAndAcceptDialog(
        page,
        () => page.getByRole('button', { name: 'Create account' }).click(),
      );
      expect(msg).toMatch(/password/i);
    });

    test('should block step 2 with mismatched passwords', async ({ page, testUser }) => {
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);
      await fillBusinessStep(page, {
        fullName: testUser.fullName,
        companyName: testUser.companyName,
        city: testUser.city,
      });

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
      await emailInput.fill(testUser.email);

      await page.getByPlaceholder('At least 6 characters').fill('Password123!');
      await page.getByPlaceholder('Re-enter password').fill('DifferentPass123!');

      const msg = await clickAndAcceptDialog(
        page,
        () => page.getByRole('button', { name: 'Create account' }).click(),
      );
      expect(msg).toMatch(/do not match/i);
    });

    test('should show duplicate company name error', async ({ page, testUser, supabaseAdmin }) => {
      const existingCompany = testUser.companyName;
      const priorUser = generateTestUser();

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: priorUser.email,
        password: priorUser.password,
        user_metadata: {
          phone: `+91${priorUser.phone}`,
          role: 'user',
          full_name: priorUser.fullName,
          company_name: existingCompany,
          operating_model: 'HYBRID',
        },
        email_confirm: true,
      });
      expect(createErr, 'Pre-create should succeed').toBeNull();

      if (created?.user) {
        await supabaseAdmin
          .from('organizations')
          .insert({
            name: existingCompany,
            operating_model: 'HYBRID',
            city: 'Mumbai',
            state: 'Maharashtra',
            zone: 'WEST',
          });
      }

      try {
        await page.goto('/sign-up');
        await fillPhoneStep(page, testUser.phone);

        const nameInput = page.getByPlaceholder('Your name');
        await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
        await nameInput.fill(testUser.fullName);

        await page.getByPlaceholder('Company').fill(existingCompany);

        // Wait for the debounced company-name-taken check (600ms + network).
        await page.waitForTimeout(1_500);

        // Inline error must appear (this is DOM text, not an alert).
        await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 8_000 });
      } finally {
        if (created?.user?.id) {
          await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        }
        await supabaseAdmin.from('organizations').delete().eq('name', existingCompany);
      }
    });

    test('should block step 2 with invalid email', async ({ page, testUser }) => {
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);
      await fillBusinessStep(page, {
        fullName: testUser.fullName,
        companyName: testUser.companyName,
        city: testUser.city,
      });

      const emailInput = page.getByPlaceholder('you@example.com');
      await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
      await emailInput.fill('not-an-email');

      await page.getByPlaceholder('At least 6 characters').fill(testUser.password);
      await page.getByPlaceholder('Re-enter password').fill(testUser.password);

      const msg = await clickAndAcceptDialog(
        page,
        () => page.getByRole('button', { name: 'Create account' }).click(),
      );
      expect(msg).toMatch(/valid email/i);
    });
  });

  // ─── City picker ─────────────────────────────────────────────────────────────

  test.describe('City picker', () => {
    test.beforeEach(async ({ page, testUser }) => {
      // All city picker tests start on step 1 (business details).
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);
      const nameInput = page.getByPlaceholder('Your name');
      await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
    });

    test('should filter cities when searching', async ({ page }) => {
      // Open the city picker modal.
      const cityTrigger = page.getByText('Search & select city');
      await cityTrigger.waitFor({ state: 'visible', timeout: 8_000 });
      await cityTrigger.click();

      const citySearchInput = page.getByPlaceholder('Search city or state...');
      await citySearchInput.waitFor({ state: 'visible', timeout: 8_000 });
      await citySearchInput.fill('Mum');
      await page.waitForTimeout(350);

      // "Mumbai" should appear in the modal list.
      await expect(page.getByText('Mumbai').first()).toBeVisible({ timeout: 5_000 });

      // Cities that don't match "Mum" (e.g. "Delhi") should not be visible.
      await expect(page.getByText('Delhi').first()).toBeHidden();
    });

    test('should auto-fill state and zone when city selected', async ({ page }) => {
      // Open the city picker modal.
      const cityTrigger = page.getByText('Search & select city');
      await cityTrigger.waitFor({ state: 'visible', timeout: 8_000 });
      await cityTrigger.click();

      const citySearchInput = page.getByPlaceholder('Search city or state...');
      await citySearchInput.waitFor({ state: 'visible', timeout: 8_000 });
      await citySearchInput.fill('Mumbai');
      await page.waitForTimeout(350);

      await page.getByText('Mumbai').first().click();
      // Modal closes after selection.

      // After selecting Mumbai, the state label "Maharashtra" must appear.
      await expect(page.getByText('Maharashtra').first()).toBeVisible({ timeout: 5_000 });

      // Zone badge "West Zone" should appear.
      await expect(page.getByText(/West Zone/i)).toBeVisible({ timeout: 5_000 });
    });

    test('should clear search on modal close', async ({ page }) => {
      // Open the city picker modal.
      const cityTrigger = page.getByText('Search & select city');
      await cityTrigger.waitFor({ state: 'visible', timeout: 8_000 });
      await cityTrigger.click();

      const citySearchInput = page.getByPlaceholder('Search city or state...');
      await citySearchInput.waitFor({ state: 'visible', timeout: 8_000 });
      await citySearchInput.fill('Mum');
      await page.waitForTimeout(350);
      await expect(page.getByText('Mumbai').first()).toBeVisible({ timeout: 5_000 });

      // Close the modal without selecting by pressing Escape.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);

      // Re-open the modal to verify the search text was cleared.
      const cityTriggerAfter = page.getByText('Search & select city');
      await cityTriggerAfter.waitFor({ state: 'visible', timeout: 6_000 });
      await cityTriggerAfter.click();

      const reopenedInput = page.getByPlaceholder('Search city or state...');
      await reopenedInput.waitFor({ state: 'visible', timeout: 8_000 });

      const inputValue = await reopenedInput.inputValue();
      // Search text should be cleared on modal close.
      expect(inputValue).not.toBe('Mum');
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  test.describe('Edge cases', () => {
    test('should handle back navigation between steps', async ({ page, testUser }) => {
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);

      // We should now be on step 1.
      await expect(page.getByPlaceholder('Your name')).toBeVisible({ timeout: 10_000 });

      // Click the "Previous" back button to return to step 0.
      await page.getByRole('button', { name: /previous|back/i }).first().click();

      // Step 0 phone input must be visible again.
      await expect(page.getByPlaceholder('000 000 0000')).toBeVisible({ timeout: 5_000 });
    });

    test('should persist entered data when navigating back from step 2 to step 1', async ({
      page,
      testUser,
    }) => {
      await page.goto('/sign-up');
      await fillPhoneStep(page, testUser.phone);

      // Fill step 1.
      const nameInput = page.getByPlaceholder('Your name');
      await nameInput.waitFor({ state: 'visible', timeout: 15_000 });
      await nameInput.fill(testUser.fullName);
      await page.getByPlaceholder('Company').fill(testUser.companyName);
      await page.waitForTimeout(800);

      // Select city via the modal picker.
      const cityTrigger = page.getByText('Search & select city');
      await cityTrigger.waitFor({ state: 'visible', timeout: 8_000 });
      await cityTrigger.click();

      const citySearchInput = page.getByPlaceholder('Search city or state...');
      await citySearchInput.waitFor({ state: 'visible', timeout: 8_000 });
      await citySearchInput.fill(testUser.city);
      await page.waitForTimeout(350);
      await page.getByText(testUser.city).first().click();

      await page.getByRole('button', { name: 'Continue' }).nth(1).click();

      // Should be on step 2 now.
      await expect(page.getByPlaceholder('you@example.com')).toBeVisible({ timeout: 10_000 });

      // Navigate back to step 1.
      await page.getByRole('button', { name: /previous|back/i }).first().click();

      // Step 1 data should still be present.
      const nameValue = await page.getByPlaceholder('Your name').inputValue();
      expect(nameValue).toBe(testUser.fullName);

      const companyValue = await page.getByPlaceholder('Company').inputValue();
      expect(companyValue).toBe(testUser.companyName);
    });
  });
});
