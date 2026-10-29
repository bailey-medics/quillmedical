/**
 * Screenshots for the guide "Assign a teaching admin".
 *
 * Taken as the seeded operator, who can open every part of Admin. A new
 * person is found missing on the organisation's Add staff page, and the
 * new user form it opens is left at its first step: the guide's point
 * there is which profession to choose.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, SEEDED, signIn } from "./signIn";

test("assign a teaching admin", async ({ page }) => {
  await signIn(page, PEOPLE.operator);

  await page.goto("/admin/organisations");
  await page.getByText(SEEDED.organisation).click();
  const editFeatures = page.getByRole("button", { name: "Edit features" });
  await expect(editFeatures).toBeVisible();
  await editFeatures.scrollIntoViewIfNeeded();
  await shot(page, "assign-a-teaching-admin/organisation");

  await editFeatures.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Features" }),
  ).toBeVisible();
  await expect(page.getByText("Available features")).toBeVisible();
  await shot(page, "assign-a-teaching-admin/features");

  // A new person, from the organisation's Add staff page: the lookup
  // finds nobody, and the form it opens has the email and organisation.
  await page.goto("/admin/organisations");
  await page.getByText(SEEDED.organisation).click();
  await page.getByRole("button", { name: "Add staff" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: /Add staff/ }),
  ).toBeVisible();
  await page
    .getByLabel("Username or email address")
    .fill("lucy.bennett@northfield.nhs.uk");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(page.getByText(/Nobody on Quill uses/)).toBeVisible();
  await shot(page, "assign-a-teaching-admin/not-found");

  await page.getByRole("button", { name: "Create new user" }).click();
  await expect(page.getByLabel("Email")).toHaveValue(
    "lucy.bennett@northfield.nhs.uk",
  );
  await page.getByLabel("Full name").fill("Lucy Bennett");
  await page.getByLabel("Username").fill("lucy.bennett");
  await page.getByLabel("Initial password").fill("a-first-password");
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: "Teaching admin", exact: true })
    .click();
  await shot(page, "assign-a-teaching-admin/basic-details");

  await page.goto("/admin/users");
  // An operator sees everybody, which is more than one page of the list,
  // so find the person as a reader would.
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder(/Search/).fill("Sarah");
  await page.getByRole("row", { name: /Sarah Mitchell/ }).click();
  await expect(page.getByText("Send invite email")).toBeVisible();
  await shot(page, "assign-a-teaching-admin/user");
});
