import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test("displays user profile information", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings/);
    // Should show the logged-in user's username
    await expect(page.getByText("educator")).toBeVisible();
  });

  test("password change section is accessible", async ({ page }) => {
    await page.goto("/settings/password");

    await expect(page).toHaveURL(/\/settings\/password/);
    await expect(
      page.getByLabel(/current password|old password/i),
    ).toBeVisible();
    await expect(page.getByLabel(/new password/i).first()).toBeVisible();
  });
});
