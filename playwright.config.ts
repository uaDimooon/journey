import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the full stack on DEDICATED ports (backend 8789,
// frontend 5175) with a throwaway SQLite DB, so they never touch the dev
// stack (8787/5173) or the test stack (8788/5174). The dev frontend build
// exposes window.__journeyTest (see CanvasRenderer) for deterministic canvas
// targeting. See docs/TESTING.md.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:5175",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      // Fresh DB each run so signup/journey assertions are deterministic.
      command:
        "sh -c 'rm -f e2e/.data/e2e.db* ; JOURNEY_ENV=test JOURNEY_DB_PATH=e2e/.data/e2e.db PORT=8789 node server/index.mjs'",
      url: "http://localhost:8789/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "VITE_API_TARGET=http://localhost:8789 vite --port 5175",
      url: "http://localhost:5175",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
