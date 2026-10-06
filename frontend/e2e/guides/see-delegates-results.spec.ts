/**
 * Screenshots for the guide "See delegates' results".
 *
 * Taken as `educator`, the seeded teaching admin. Nothing is changed: both
 * pages only read.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";

test("see delegates' results", async ({ page }) => {
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
  await shot(page, "see-delegates-results/all-delegates");
});
