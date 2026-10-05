/**
 * Screenshots for the guide "Find your way round a safety case".
 *
 * The safety cases are a mock-up whose data lives in the browser, so
 * nothing is seeded for these but the officer who signs in.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("find your way round a safety case", async ({ page }) => {
  await signIn(page, PEOPLE.safetyOfficer);

  await page.goto("/safety");
  await expect(
    page.getByRole("heading", { level: 1, name: "Safety" }),
  ).toBeVisible();
  await expect(page.getByText("Results acknowledgement service")).toBeVisible();
  await shot(page, "find-your-way-round-a-safety-case/cases");

  // The fullest of the mock-up's five cases: every hazard status, three
  // incidents, and sections both signed and waiting.
  await page.getByText("Results acknowledgement service").click();
  await expect(page.getByText("Open hazard log")).toBeVisible();
  await shot(page, "find-your-way-round-a-safety-case/case");
});
