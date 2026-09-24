import { test, expect } from "../fixtures/axe";

test.describe("Protected routes", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated user is redirected to login", async ({
    page,
    scanPage,
  }) => {
    await page.goto("/teaching");

    await expect(page).toHaveURL(/\/login/);
    await page.waitForLoadState("networkidle");
    await scanPage("login-after-redirect");
  });

  test("unauthenticated user cannot access settings", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/login/);
  });
});
