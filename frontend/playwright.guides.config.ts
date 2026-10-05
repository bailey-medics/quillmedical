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
  // One at a time: some specs write, and a screenshot is not worth a race.
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
      // No shared sign-in: each spec signs in as the seeded person its
      // guide is about, with `signIn` from `e2e/guides/signIn.ts`.
      name: "guides",
      testDir: "./e2e/guides",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: "light",
      },
    },
  ],
});
