/**
 * Screenshots for the guide "See delegates' results".
 *
 * Taken as the seeded teaching admin, of the delegates and attempts that
 * `backend/scripts/seed_guides.py` makes up.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("see delegates' results", async ({ page }) => {
  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/teaching");
  await expect(
    page.getByRole("heading", { level: 1, name: "Teaching" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View delegates" }),
  ).toBeVisible();
  await shot(page, "see-delegates-results/teaching-admin");

  await page.getByRole("link", { name: "View delegates" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "All delegates" }),
  ).toBeVisible();
  await expect(page.getByText("Total delegates")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Aisha Rahman" })).toBeVisible();
  await shot(page, "see-delegates-results/all-delegates");
});
