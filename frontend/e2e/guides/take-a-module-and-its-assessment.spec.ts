/**
 * Screenshots for the guide "Take a module and its assessment".
 *
 * Taken as `educator`, who may take modules as a delegate may. It stops at
 * the module's page: starting an assessment would write an attempt, and a
 * second run would then find a different history.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";

test("take a module and its assessment", async ({ page }) => {
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
