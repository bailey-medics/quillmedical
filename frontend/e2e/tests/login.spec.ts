import { test, expect, type Page } from "@playwright/test";

async function expectSuccessfulLoginRedirect(page: Page) {
  await expect
    .poll(
      () => {
        const pathname = new URL(page.url()).pathname;
        return pathname === "/" || pathname.startsWith("/teaching");
      },
      {
        timeout: 60_000,
        message:
          "Expected login to redirect to either / or /teaching within timeout",
      },
    )
    .toBe(true);

  await expect(page).not.toHaveURL(/\/login/);
}

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

    await expectSuccessfulLoginRedirect(page);
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Username").fill("educator");
    await page.getByLabel("Password").pressSequentially("wrong-password");
    await page.getByLabel("Password").press("Enter");

    await expect(page).toHaveURL(/\/login/);
    const errorMessage = page
      .locator("p")
      .filter({
        hasText: /invalid|incorrect|too many|rate limit|login failed/i,
      })
      .first();
    await expect(errorMessage).toBeVisible({
      timeout: 10_000,
    });
  });
});
