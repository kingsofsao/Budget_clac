import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests must never touch a real project: always point the app under test at
 * the LOCAL Supabase stack, whatever .env.local contains. Override with
 * E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY (local URLs only).
 */
function localSupabaseEnv() {
  let url = process.env.E2E_SUPABASE_URL;
  let key = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const status = execSync("npx supabase status -o env", { encoding: "utf8" });
    const read = (name: string) => new RegExp(`^${name}="?([^"\n]+)"?$`, "m").exec(status)?.[1];
    url ??= read("API_URL");
    key ??= read("PUBLISHABLE_KEY") ?? read("ANON_KEY");
  }
  if (!url || !key)
    throw new Error("Local Supabase is not running. Start it with `npm run db:start`.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
    throw new Error(`Refusing to run e2e tests against a non-local Supabase (${url}).`);
  }
  return { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key };
}

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
    // Always build fresh so the local Supabase settings are baked into the bundle.
    reuseExistingServer: false,
    env: localSupabaseEnv(),
    timeout: 240_000,
  },
});
