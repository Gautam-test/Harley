import { defineConfig, devices } from '@playwright/test';

// Tests run against the dev stack, on whichever ports it actually came up on.
// Override via `BUYER_BASE_URL=...` etc. in CI / staging.
const BUYER = process.env.BUYER_BASE_URL ?? 'http://localhost:5180';
const DEALER = process.env.DEALER_BASE_URL ?? 'http://localhost:5181';
const ADMIN = process.env.ADMIN_BASE_URL ?? 'http://localhost:5182';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // tests share one DB; run serially to avoid lead-id collisions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'buyer',
      testMatch: /buyer\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: BUYER },
    },
    {
      name: 'dealer',
      testMatch: /dealer\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: DEALER },
    },
    {
      name: 'admin',
      testMatch: /admin\..*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN },
    },
  ],
});
