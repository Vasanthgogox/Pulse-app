import { type Page, type Locator, expect } from '@playwright/test';

export class SignInPage {
  private readonly emailInput: Locator;
  private readonly passwordInput: Locator;
  // testID="signin-submit-btn" targets the TouchableOpacity outer div directly.
  // Avoids clicking the inner <Text> child which has pointer-events:none in RN Web.
  private readonly submitButton: Locator;

  constructor(private readonly page: Page) {
    this.emailInput = page.getByPlaceholder('Email Address');
    this.passwordInput = page.getByPlaceholder('Your Password');
    this.submitButton = page.getByTestId('signin-submit-btn');
  }

  async goto(): Promise<void> {
    await this.page.goto('/sign-in?direct=1');
  }

  async waitForReady(): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async fillEmail(email: string): Promise<void> {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.goto();
    await this.waitForReady();
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.submit();
  }

  getErrorLocator(): Locator {
    // The sign-in component renders signInError as inline text beneath the form.
    return this.page.locator('[data-testid="signin-error"], text=/incorrect email or password|enter email and password/i').first();
  }

  async getErrorText(): Promise<string> {
    // Covers both validation message variants rendered in the component.
    const locator = this.page.locator('text=/incorrect email or password|enter email and password/i').first();
    await locator.waitFor({ state: 'visible', timeout: 10_000 });
    return (await locator.textContent()) ?? '';
  }

  async expectVisible(): Promise<void> {
    await expect(this.emailInput).toBeVisible({ timeout: 15_000 });
    await expect(this.passwordInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }
}
