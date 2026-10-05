/**
 * Screenshots for the guide "Read an incident report".
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

test("read an incident report", async ({ page }) => {
  await signIn(page, PEOPLE.safetyOfficer);

  await page.goto(`${CASE}/incidents`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Incidents" }),
  ).toBeVisible();
  await expect(page.getByText("INC-2026-006")).toBeVisible();
  await shot(page, "read-an-incident-report/incidents");

  await page.goto(`${CASE}/incidents/INC-2026-006`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Incident INC-2026-006" }),
  ).toBeVisible();
  await expect(page.getByText("Root cause")).toBeVisible();
  await shot(page, "read-an-incident-report/incident");
});
