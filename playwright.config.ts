import { defineConfig, devices } from '@playwright/test';

// E2E runs against a deployed URL (default: production). Override with
//   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://resturant-and-delivery.vercel.app';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
