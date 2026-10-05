import { defineConfig, devices } from "@playwright/test";

/**
 * Retakes the screenshots the in-app guides show.
 *
 * A config of its own, apart from `playwright.config.ts`, because this is
 * a build step and not a test of the application: `just e2e` and CI's
 * end-to-end job must never run it, and it must never run them. Run it
 * with `just guide-screenshots`. See
 * `docs/docs/plans/2026-10-05-in-app-guides-plan.md`.
 *
 * One desktop viewport in the light theme, at twice the pixel density so
 * the text stays sharp on a high-density screen.
 */
export default defineConfig({
  testDir: "./e2e",
  // One at a time: the specs sign in as the same seeded person, and a
  // screenshot is not worth a race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // The same sign-in the end-to-end tests use: `educator`, a teaching
      // admin seeded by `backend/scripts/seed_ci.py`.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "guides",
      testDir: "./e2e/guides",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: "light",
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
