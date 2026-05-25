import { test, expect } from "@playwright/test";

test.describe("Protected routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/teaching");

    await expect(page).toHaveURL(/\/login/);
  });

  test("unauthenticated user cannot access settings", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/login/);
  });
});
