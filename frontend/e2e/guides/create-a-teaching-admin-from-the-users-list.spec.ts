/**
 * Screenshots for the guide "Create a teaching admin from the users list".
 *
 * Taken as the seeded operator, who can open every part of Admin. The new
 * user form is left at its first step: the guide's point there is which
 * profession to choose.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

test("create a teaching admin from the users list", async ({ page }) => {
  await signIn(page, PEOPLE.operator);

  await page.goto("/admin/organisations");
  await page.getByText(SEEDED.organisation).click();
  const editFeatures = page.getByRole("button", { name: "Edit features" });
  await expect(editFeatures).toBeVisible();
  await editFeatures.scrollIntoViewIfNeeded();
  await shot(page, "create-a-teaching-admin-from-the-users-list/organisation");

  await editFeatures.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Features" }),
  ).toBeVisible();
  await expect(page.getByText("Available features")).toBeVisible();
  await shot(page, "create-a-teaching-admin-from-the-users-list/features");

  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill("Lucy Bennett");
  await page.getByLabel("Email").fill("lucy.bennett@northfield.nhs.uk");
  await page.getByLabel("Username").fill("lucy.bennett");
  await page.getByLabel("Initial password").fill("a-first-password");
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: "Teaching admin", exact: true })
    .click();
  await shot(page, "create-a-teaching-admin-from-the-users-list/basic-details");

  await page.goto("/admin/users");
  // An operator sees everybody, which is more than one page of the list,
  // so find the person as a reader would.
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder(/Search/).fill("Sarah");
  await page.getByRole("row", { name: /Sarah Mitchell/ }).click();
  await expect(page.getByText("Send invite email")).toBeVisible();
  await shot(page, "create-a-teaching-admin-from-the-users-list/user");
});
