import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("renders the login form", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Sign in to Quill" }),
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("logs in with valid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("educator");
    await page.getByLabel("Password").pressSequentially("educator123");
    await page.getByLabel("Password").press("Enter");

    await page.waitForURL("**/teaching", { timeout: 60_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("educator");
    await page.getByLabel("Password").pressSequentially("wrong-password");
    await page.getByLabel("Password").press("Enter");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid|incorrect/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
