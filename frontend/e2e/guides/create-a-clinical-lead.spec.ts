/**
 * Screenshots for the guide "Create a clinical lead".
 *
 * Fills in the new user form as the seeded teaching admin, for a clinical
 * lead whose site has not been added yet, so the organisation is chosen.
 * Stops at the review without creating the account: the guide's pictures
 * end there, and the other guides' pictures should show the seeded people
 * only.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

test("create a clinical lead", async ({ page }) => {
  // Exact, so the "next page" button under the list of users does not match.
  const next = page.getByRole("button", { name: "Next", exact: true });

  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Users" }),
  ).toBeVisible();
  // A seeded person's row, not any row: the loading skeleton is drawn as
  // rows too.
  await expect(
    page.getByRole("row", { name: new RegExp(PEOPLE.teachingAdmin) }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add user" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Create new user" }),
  ).toBeVisible();

  await page.getByLabel("Full name").fill("Dr Hannah Price");
  await page.getByLabel("Email").fill("hannah.price@northfield.example");
  await page.getByLabel("Username").fill("hannah.price");
  await page.getByLabel("Initial password").fill("a-first-password");
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: "Teaching clinical lead", exact: true })
    .click();
  await shot(page, "create-a-clinical-lead/basic-details");
  await next.click();

  await expect(
    page.getByRole("heading", { name: "Organisation/site" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: /^Organisation/ }).click();
  await page
    .getByRole("option", { name: SEEDED.organisation, exact: true })
    .click();
  // Close the list, which stays open over the button for more choices.
  await page.keyboard.press("Escape");
  await shot(page, "create-a-clinical-lead/organisation-site");
  await next.click();

  await expect(
    page.getByRole("heading", { name: "Competency configuration" }),
  ).toBeVisible();
  await next.click();

  // Practice: left as it is.
  await expect(
    page.getByRole("heading", { name: SEEDED.organisation, level: 2 }),
  ).toBeVisible();
  await next.click();

  // Enrolment: nothing ticked.
  await expect(
    page.getByText("Tick each module they are to be enrolled on."),
  ).toBeVisible();
  await next.click();

  await expect(page.getByRole("button", { name: "Create user" })).toBeVisible();
  await shot(page, "create-a-clinical-lead/review");
});
