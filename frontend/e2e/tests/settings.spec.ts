import { test, expect } from "../fixtures/axe";

test.describe("Settings page", () => {
  test("displays user profile information", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings/);
    // Should show the logged-in user's username
    await expect(page.getByText("educator")).toBeVisible();
  });

  test("password change section is accessible", async ({ page, scanPage }) => {
    await page.goto("/settings/account");

    await expect(page).toHaveURL(/\/settings\/account/);
    await expect(
      page.getByLabel(/current password|old password/i),
    ).toBeVisible();
    await expect(page.getByLabel(/new password/i).first()).toBeVisible();

    await scanPage("settings-account");
  });
});
