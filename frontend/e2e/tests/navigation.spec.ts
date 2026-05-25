import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("teaching dashboard loads after login", async ({ page }) => {
    await page.goto("/teaching");

    await expect(page).toHaveURL(/\/teaching/);
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("settings page is accessible from navigation", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole("heading", { name: /settings/i }),
    ).toBeVisible();
  });

  test("logout redirects to login page", async ({ page }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");

    // Logout is a Mantine NavLink — scope to sidebar to avoid strict mode violation
    await page.locator("#app-navbar").getByText("Logout").click();

    await expect(page).toHaveURL(/\/login/);
  });
});
