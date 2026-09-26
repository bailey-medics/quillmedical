import { test, expect } from "../fixtures/axe";

test.describe("Teaching dashboard", () => {
  test("loads the teaching page", async ({ page }) => {
    await page.goto("/teaching");

    await expect(page).toHaveURL(/\/teaching/);
    // Page should load without errors
    await expect(page.locator("body")).not.toContainText(
      "Something went wrong",
    );
  });

  test("shows teaching modules heading", async ({ page, scanPage }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");

    // The dashboard should show the main heading after data loads
    await expect(
      page.getByRole("heading", { name: /teaching modules/i }),
    ).toBeVisible({ timeout: 10000 });
    // The page's h1 names the browser tab too (WCAG 2.4.2)
    await expect(page).toHaveTitle(/^Teaching modules – /);

    await scanPage("teaching-modules");
  });

  // .github/scripts/ci/fetch-e2e-teaching.sh fetches this module from
  // respiratory-teaching, and seed_ci.py opens it for the CI organisation
  test("opens a module from the dashboard", async ({ page, scanPage }) => {
    await page.goto("/teaching");

    await page.getByRole("link", { name: "View module" }).first().click();

    await expect(page).toHaveURL(/\/teaching\/chest-xray-interpretation-test$/);
    await expect(
      page.getByRole("heading", { name: /chest x-ray interpretation/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "Start learning" }),
    ).toBeVisible();

    await scanPage("teaching-module");
  });
});
