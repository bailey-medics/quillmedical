/**
 * Screenshots for the guide "Record CPD".
 *
 * Taken of the passport `backend/scripts/seed_guides.py` gives its holder.
 * Forms are opened and left unsaved: the pictures are of the forms.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("record cpd", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  await page.goto("/passport/cpd");
  await expect(
    page.getByText("Regional acute medicine teaching day"),
  ).toBeVisible();
  await shot(page, "record-cpd/cpd");

  await page.getByRole("button", { name: "Add an activity" }).click();
  await expect(page.getByText("What was it?")).toBeVisible();
  await shot(page, "record-cpd/activity");

  await page.goto("/settings/cpd-date-ranges");
  await expect(
    page.getByRole("heading", { level: 1, name: "CPD date ranges" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add a date range" }),
  ).toBeVisible();
  await shot(page, "record-cpd/date-ranges");
});
