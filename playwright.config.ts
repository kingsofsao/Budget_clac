import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build talking to the LOCAL
 * Supabase stack (`npm run db:start`). They create their own trips, so they
 * can run repeatedly. The demo-trip test also needs the seed (`npm run db:reset`).
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Keep each run deterministic: no service-worker caching between tests.
    serviceWorkers: "block",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
