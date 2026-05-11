import { defineConfig, devices } from '@playwright/test';

// Tests run against the dev stack, on whichever ports it actually came up on.
// Override via `BUYER_BASE_URL=...` etc. in CI / staging.
//
// Buyer SPA lives at root; dealer + admin SPAs are mounted under /dealer/
// and /admin/ respectively (Vite `base` config). The baseURLs include a
// trailing slash so tests can navigate via relative paths like
// page.goto('login') and the URL composes correctly to /dealer/login.
const BUYER = process.env.BUYER_BASE_URL ?? 'http://localhost:5180/';
const DEALER = process.env.DEALER_BASE_URL ?? 'http://localhost:5181/dealer/';
const ADMIN = process.env.ADMIN_BASE_URL ?? 'http://localhost:5182/admin/';

// Cross-browser matrix is opt-in: default runs are Chromium-only to keep
// the developer-loop fast. Set CROSS_BROWSER=1 (or pass --project=
// buyer-firefox / buyer-webkit) to exercise Firefox + WebKit on the buyer
// smoke flows.
const CROSS_BROWSER = process.env.CROSS_BROWSER === '1';

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
    // Cross-browser smoke — run buyer.home + buyer.tracking on Firefox
    // and WebKit so we catch engine-specific layout / CSS regressions
    // without tripling the full suite's runtime. Opt-in via
    // CROSS_BROWSER=1 or with explicit --project filters.
    ...(CROSS_BROWSER
      ? [
          {
            name: 'buyer-firefox',
            testMatch: /buyer\.(home|tracking)\.spec\.ts/,
            use: { ...devices['Desktop Firefox'], baseURL: BUYER },
          },
          {
            name: 'buyer-webkit',
            testMatch: /buyer\.(home|tracking)\.spec\.ts/,
            use: { ...devices['Desktop Safari'], baseURL: BUYER },
          },
        ]
      : []),
  ],
});
