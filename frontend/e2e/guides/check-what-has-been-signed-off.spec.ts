/**
 * Screenshots for the guide "Check what has been signed off".
 *
 * The safety cases are a mock-up whose data lives in the browser, so
 * nothing is seeded for these but the officer who signs in.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

// The fullest of the mock-up's five cases: every hazard status, three
// incidents, and sections both signed and waiting.
const CASE = "/safety/sc-003";

test("check what has been signed off", async ({ page }) => {
  await signIn(page, PEOPLE.safetyOfficer);

  await page.goto(`${CASE}/sign-off`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Compliance sign-off" }),
  ).toBeVisible();
  await expect(page.getByText("Awaiting signature").first()).toBeVisible();
  await shot(page, "check-what-has-been-signed-off/sections");

  // A section still waiting, so the picture shows where signing will go.
  await page.goto(`${CASE}/sign-off/cscr`);
  await expect(page.getByText("What this signature attests")).toBeVisible();
  await shot(page, "check-what-has-been-signed-off/section");
});
