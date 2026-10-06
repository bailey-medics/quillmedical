/**
 * Screenshots for the guide "Take a module and its assessment".
 *
 * Taken as the seeded delegate who has no attempts of their own.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("take a module and its assessment", async ({ page }) => {
  await signIn(page, PEOPLE.learner);
  await page.goto("/teaching");
  await expect(
    page.getByRole("heading", { level: 1, name: "Teaching modules" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View module" }).first(),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/teaching-modules");

  await page.getByRole("link", { name: "View module" }).first().click();
  await expect(
    page.getByRole("button", { name: "Start assessment" }),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/module");
});
