/**
 * Screenshots for the guide "Add somebody to the passport".
 *
 * Taken as the seeded passport admin, with the new user form left at its
 * first step: the guide's point there is which profession to choose.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("add somebody to the passport", async ({ page }) => {
  await signIn(page, PEOPLE.passportAdmin);

  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill("Sam Sample");
  await page.getByLabel("Email").fill("sam.sample@example.org");
  await page.getByLabel("Username").fill("sam.sample");
  await page.getByLabel("Initial password").fill("a-first-password");
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: "Passport delegate", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Base profession" }),
  ).toHaveValue("Passport delegate");
  await shot(page, "add-somebody-to-the-passport/basic-details");
});
