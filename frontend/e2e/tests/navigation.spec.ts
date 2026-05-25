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

    // Logout is a NavLink (renders as <a>) in the sidebar navigation
    const logoutLink = page.getByRole("link", { name: /log\s*out/i });
    if (await logoutLink.isVisible()) {
      await logoutLink.click();
    } else {
      // May be in a mobile nav drawer — open it first
      const burger = page.getByRole("button", { name: /menu|navigation/i });
      if (await burger.isVisible()) {
        await burger.click();
      }
      await page.getByRole("link", { name: /log\s*out/i }).click();
    }

    await expect(page).toHaveURL(/\/login/);
  });
});
