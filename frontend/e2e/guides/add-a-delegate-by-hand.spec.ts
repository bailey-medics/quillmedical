/**
 * Screenshots for the guide "Add a delegate by hand".
 *
 * Walks the new user form as the seeded teaching admin and stops at the
 * review step: the guide ends there, and the pictures need nobody made.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

test("add a delegate by hand", async ({ page }) => {
  // The stepper's own button, matched whole: a table on a later step
  // pages its rows, and its "next page" button would match a looser name.
  const next = page.getByRole("button", { name: "Next", exact: true });

  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Users" }),
  ).toBeVisible();
  await expect(page.getByRole("row").nth(1)).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/users");

  await page.getByRole("button", { name: "Add user" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Create new user" }),
  ).toBeVisible();

  await page.getByLabel("Full name").fill("Sam Sample");
  await page.getByLabel("Email").fill("sam.sample@example.org");
  await page.getByLabel("Username").fill("sam.sample");
  await page.getByLabel("Initial password").fill("a-first-password");
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: "Teaching delegate", exact: true })
    .click();
  await shot(page, "add-a-delegate-by-hand/basic-details");
  await next.click();

  await expect(
    page.getByRole("heading", { name: "Organisation/site" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: /^Site/ }).click();
  await page.getByRole("option", { name: new RegExp(SEEDED.site) }).click();
  // Close the list, which stays open over the button for more choices.
  await page.keyboard.press("Escape");
  await shot(page, "add-a-delegate-by-hand/organisation-site");
  await next.click();

  await expect(
    page.getByRole("heading", { name: "Competency configuration" }),
  ).toBeVisible();
  await next.click();

  // Practice: left as it is.
  await expect(
    page.getByRole("heading", { name: SEEDED.site, level: 2 }),
  ).toBeVisible();
  await next.click();

  // Enrolment: the first module the organisation serves.
  await expect(
    page.getByText("Tick each module they are to be enrolled on."),
  ).toBeVisible();
  const module = page.getByRole("checkbox").first();
  // The box itself is visually hidden, so click its label.
  await page.locator(`label[for="${await module.getAttribute("id")}"]`).click();
  await expect(module).toBeChecked();
  await shot(page, "add-a-delegate-by-hand/enrolment");
  await next.click();

  await expect(page.getByRole("button", { name: "Create user" })).toBeVisible();
  await shot(page, "add-a-delegate-by-hand/review");
});
