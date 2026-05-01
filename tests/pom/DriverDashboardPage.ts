import { type Page, expect } from '@playwright/test';

export class DriverDashboardPage {
  constructor(private readonly page: Page) {}

  async waitForLoad(): Promise<void> {
    // Expo Router strips group names: /(driver)/index renders as just /.
    // Confirm redirect away from sign-in — that's how we know auth succeeded.
    await expect(this.page).not.toHaveURL(/sign-in/, { timeout: 20_000 });
  }

  async isLoaded(): Promise<boolean> {
    return !/sign-in/.test(this.page.url());
  }
}
