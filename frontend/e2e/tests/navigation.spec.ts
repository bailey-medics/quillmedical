import { test, expect } from "../fixtures/axe";

test.describe("Navigation", () => {
  test("teaching dashboard loads after login", async ({ page, scanPage }) => {
    await page.goto("/teaching");

    await expect(page).toHaveURL(/\/teaching/);
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );

    await page.waitForLoadState("networkidle");
    await scanPage("teaching-dashboard");
  });

  test("settings page is accessible from navigation", async ({
    page,
    scanPage,
  }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings/);
    await expect(
      page.getByRole("heading", { name: /settings/i }),
    ).toBeVisible();

    await scanPage("settings");
  });

  test("logout redirects to login page", async ({ page }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");

    // Logout NavLink lives in the <aside> (desktop sidebar)
    await page.getByRole("complementary").getByText("Logout").click();

    await expect(page).toHaveURL(/\/login/);
  });
});
