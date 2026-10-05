/**
 * Screenshots for the guide "Read the hazard log".
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

test("read the hazard log", async ({ page }) => {
  await signIn(page, PEOPLE.safetyOfficer);

  await page.goto(`${CASE}/hazards`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hazards" }),
  ).toBeVisible();
  await expect(page.getByText("H-01")).toBeVisible();
  await shot(page, "read-the-hazard-log/hazards");

  // H-03 is the one with an incident against it, so the page's last card
  // has something in it.
  await page.goto(`${CASE}/hazards/H-03`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hazard H-03" }),
  ).toBeVisible();
  await expect(page.getByText("Mitigation").first()).toBeVisible();
  await shot(page, "read-the-hazard-log/hazard");
});
