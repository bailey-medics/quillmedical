import { test, expect } from "@playwright/test";

test.describe("Teaching dashboard", () => {
  test("loads the teaching page", async ({ page }) => {
    await page.goto("/teaching");

    await expect(page).toHaveURL(/\/teaching/);
    // Page should load without errors
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("shows assessment history section", async ({ page }) => {
    await page.goto("/teaching");

    // The dashboard should have an assessment history section (even if empty)
    await expect(
      page.getByText(/assessment|history|recent/i).first(),
    ).toBeVisible();
  });
});
