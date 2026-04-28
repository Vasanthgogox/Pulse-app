import { test, expect } from "../../fixtures/auth.fixture";
import { getUserByEmail } from "../../utils/supabase.admin";
import { waitForProvisioning } from "../../utils/retry";

test.describe("Sign-up onboarding (current UI)", () => {
  test("should complete phone->otp->org->details->account path", async ({
    page,
    testUser,
  }) => {
    await page.goto("/sign-up");

    await page.getByPlaceholder("000 000 0000").fill(testUser.phone);
    await page.getByText(/^Send OTP$/).click();

    const otpDigits = ["1", "2", "3", "4", "5", "6"];
    const otpInputs = page.locator('input[maxlength="1"]');
    for (let i = 0; i < otpDigits.length; i += 1) {
      await otpInputs.nth(i).fill(otpDigits[i]);
    }
    await page.getByText(/^Verify OTP$/).click();

    await page.getByPlaceholder("e.g. GoGoX Logistics").fill(testUser.companyName);
    await page.getByText("Continue").first().click();

    await page.getByText("Sole Proprietor").click();
    await page.getByText("1-10").click();
    await page.getByPlaceholder("Search & select city").fill(testUser.city);
    await page.getByText(testUser.city).first().click();
    await page.getByText("Continue").nth(1).click();

    await page.getByPlaceholder("Your name").fill(testUser.fullName);
    await page.getByPlaceholder("you@example.com").fill(testUser.email);
    await page.getByPlaceholder("At least 6 characters").fill(testUser.password);
    await page.getByPlaceholder("Re-enter password").fill(testUser.password);
    await page.getByText(/^Create account$/).nth(1).click();

    await expect(page.getByText("You're in!")).toBeVisible({ timeout: 15_000 });

    const authUser = await getUserByEmail(testUser.email);
    expect(authUser, "Auth user should exist").not.toBeNull();
    const provisioned = await waitForProvisioning(testUser.email, authUser!.id, 10_000);
    expect(provisioned.profile.email).toBe(testUser.email);
    expect(provisioned.membership.role).toBe("owner");
  });
});

