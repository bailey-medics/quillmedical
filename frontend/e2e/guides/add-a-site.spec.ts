/**
 * Screenshots for the guide "Add a site".
 *
 * Fills in the form as the seeded teaching admin and stops before
 * creating the site: the guide ends there, and the other guides'
 * pictures should show the seeded sites only.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

test("add a site", async ({ page }) => {
  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/sites");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sites" }),
  ).toBeVisible();
  // A seeded site's row, not any row: the loading skeleton is drawn as
  // rows too, and would be photographed in place of the list. The button
  // is the one the guide points at.
  await expect(
    page.getByRole("row", { name: new RegExp(SEEDED.site) }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add site" })).toBeVisible();
  await shot(page, "add-a-site/sites");

  await page.getByRole("button", { name: "Add site" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Add site" }),
  ).toBeVisible();

  await page.getByRole("combobox", { name: /^Organisation/ }).click();
  await page
    .getByRole("option", { name: SEEDED.organisation, exact: true })
    .click();
  await page.getByLabel(/^Name/).fill("Riverside Community Hospital");
  await page.getByRole("combobox", { name: /^Type/ }).click();
  await page.getByRole("option", { name: "Site", exact: true }).click();
  await page.getByLabel(/^Location/).fill("1 River Road, Northfield NF1 2AB");
  await page.getByRole("combobox", { name: /^Clinical lead/ }).click();
  await page
    .getByRole("option", { name: new RegExp(SEEDED.clinicalLeadEmail) })
    .click();
  await expect(page.getByRole("button", { name: "Create site" })).toBeEnabled();
  await shot(page, "add-a-site/form");
});
