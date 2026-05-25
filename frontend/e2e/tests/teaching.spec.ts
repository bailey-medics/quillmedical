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

  test("shows teaching modules heading", async ({ page }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");

    // The dashboard should show the main heading after data loads
    await expect(
      page.getByRole("heading", { name: /teaching modules/i }),
    ).toBeVisible({ timeout: 10000 });
  });
});
