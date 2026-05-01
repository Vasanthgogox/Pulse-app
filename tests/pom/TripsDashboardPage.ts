import { type Page, expect } from '@playwright/test';

export class TripsDashboardPage {
  constructor(private readonly page: Page) {}

  async waitForLoad(): Promise<void> {
    // Expo Router strips group names from URLs: /(tabs)/trips renders as /trips.
    await expect(this.page).toHaveURL(/\/trips/, { timeout: 20_000 });
  }

  async isLoaded(): Promise<boolean> {
    return /\/trips/.test(this.page.url());
  }
}
