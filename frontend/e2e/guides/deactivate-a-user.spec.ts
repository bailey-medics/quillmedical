/**
 * Screenshots for the guide "Deactivate a user".
 *
 * Walks to the confirmation as the seeded teaching admin and stops there,
 * unconfirmed: the pictures need nobody deactivated, and the delegate it
 * opens is one other guides photograph. Their passport comes with the
 * organisation's cover, which does not stop a teaching admin closing an
 * account, so the button is open as the guide describes.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("deactivate a user", async ({ page }) => {
  await signIn(page, PEOPLE.teachingAdmin);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { level: 1, name: "Users" }),
  ).toBeVisible();
  const delegate = page.getByRole("row", {
    name: new RegExp(PEOPLE.passedDelegate),
  });
  await expect(delegate).toBeVisible();
  await shot(page, "deactivate-a-user/users");

  await delegate.click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: `User: ${PEOPLE.passedDelegate}`,
    }),
  ).toBeVisible();
  // The card is below the account's details, so it is brought into view.
  const card = page.getByRole("heading", { name: "Deactivate user" });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeEnabled();
  await shot(page, "deactivate-a-user/user");

  await page.getByRole("button", { name: "Deactivate", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Deactivate user" });
  await expect(confirm).toBeVisible();
  await shot(page, "deactivate-a-user/confirm");

  // Left as it was.
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
});
