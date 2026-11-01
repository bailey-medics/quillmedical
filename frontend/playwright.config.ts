import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Two in CI, where the runner's four cores are shared with the stack the
  // tests drive. It was one, Playwright's template default, which ran the
  // tests one at a time. The tests are written to run side by side: each
  // browser project works on its own seeded member, and a retry replays
  // cleanly.
  workers: process.env.CI ? 2 : undefined,
  reporter: "html",
  // Ten seconds for a page to show what a test waits for, not the default
  // five. Passports are kept in a bucket, as in App production
  // (compose.ci.yml's `gcs` stand-in), so each save downloads and uploads
  // the passport's repository. With every worker saving at once, a save
  // took up to six seconds in a full local run on 1 November 2026.
  expect: { timeout: 10_000 },
  use: {
    // CI drives the compose.ci.yml stack on port 80. `just e2e` runs the same
    // stack on whatever free port Docker picked and passes it in here.
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      // Journeys that change what every other test sees, so they run
      // once, first, in one browser. The video gate leaves the module
      // hidden at CI Second Hospital until it has uploaded the video
      // there, and the leak tests expect the module at both.
      name: "video-gate",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      testDir: "./e2e/tests",
      testMatch: /\.gate\.spec\.ts$/,
      dependencies: ["setup"],
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      testDir: "./e2e/tests",
      testIgnore: [/\.phone\.spec\.ts$/, /\.gate\.spec\.ts$/],
      dependencies: ["setup", "video-gate"],
    },
    {
      // Safari's engine. Catches focus, scrolling and `inert` differences
      // Chromium hides; it is not Safari itself, and cannot drive
      // VoiceOver, so the manual Safari runs in the accessibility plan's
      // phase 5 still stand.
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        storageState: "e2e/.auth/user.json",
      },
      testDir: "./e2e/tests",
      testIgnore: [/\.phone\.spec\.ts$/, /\.gate\.spec\.ts$/],
      dependencies: ["setup", "video-gate"],
    },
    {
      // A phone's width, below `md`, where the navigation folds behind
      // the hamburger. The journeys written for a phone, named
      // `*.phone.spec.ts`, and the delegate's own journeys, which are
      // the ones most likely to be made on a phone: getting in, taking
      // a module, and settings. Admin journeys stay at desktop width,
      // where admin work is done. Phase 21 of
      // docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        storageState: "e2e/.auth/user.json",
      },
      testDir: "./e2e/tests",
      testMatch: [
        /\.phone\.spec\.ts$/,
        /\/getting-in\/.*\.spec\.ts$/,
        /\/taking-a-module\/.*\.spec\.ts$/,
        /\/settings\/.*\.spec\.ts$/,
      ],
      dependencies: ["setup", "video-gate"],
    },
  ],
});
