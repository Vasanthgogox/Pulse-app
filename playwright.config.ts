import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Credentials live in e2e/.env.e2e (gitignored), NOT in .env — keeps QA logins out of
// the file the dev server loads. Deliberately NOT named `.env*.local`: Expo's Metro
// bundler treats any root-level .env*.local as a source file and fails the whole web
// bundle with a TransformError on the first `#` comment. See e2e/.env.e2e.example.
dotenv.config({ path: 'e2e/.env.e2e' });

/**
 * Minimal Playwright config for `npm run test:web`. There was no config checked in yet —
 * `package.json` already wires up test:web / test:web:ui / test:web:headed / test:web:report,
 * but they had nothing to run against. Points at the Expo web dev server (see
 * nihas-tests/signin-flow.mjs for the same port/URL convention used for manual smoke checks).
 *
 * NOT yet run in this environment (no way to boot the Expo web dev server + browser here) —
 * treat these as a starting point to run and adjust locally with `npm run web` + `npm run test:web`.
 */
const PORT = 8081;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run web',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
