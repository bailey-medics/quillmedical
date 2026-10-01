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
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      testDir: "./e2e/tests",
      dependencies: ["setup"],
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
      dependencies: ["setup"],
    },
  ],
});
