/**
 * Screenshots for the guide "Change a safety officer".
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

test("change a safety officer", async ({ page }) => {
  await signIn(page, PEOPLE.safetyOfficer);

  await page.goto(`${CASE}/officers`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Officers" }),
  ).toBeVisible();
  await expect(page.getByText("Product owner")).toBeVisible();
  await shot(page, "change-a-safety-officer/officers");

  await page.getByRole("button", { name: "Edit product owner" }).click();
  await expect(page.getByLabel("Name")).toBeVisible();
  // The modal opens with a short animation.
  await page.waitForTimeout(400);
  await shot(page, "change-a-safety-officer/edit");
});
