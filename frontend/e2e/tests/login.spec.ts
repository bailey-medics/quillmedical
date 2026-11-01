/**
 * The login page: it draws, a right password signs in, and a wrong one is
 * refused as a person sees it. Nothing here reads the server's answer:
 * see `.claude/rules/e2e.md`.
 */

import { test, expect } from "../fixtures/axe";
import type { Page } from "@playwright/test";
import { PEOPLE, expectRefusedSignIn, signIn } from "../fixtures/signIn";

test.describe.configure({ timeout: 120_000 });

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

  test("renders the login form", async ({ page, scanPage }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Sign in to Quill" }),
    ).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

    await scanPage("login");
  });

  test("logs in with valid credentials", async ({ page }) => {
    await signIn(page, PEOPLE.teachingAdmin);

    await expectSuccessfulLoginRedirect(page);
  });

  test("shows error with invalid credentials", async ({ page }) => {
    // The backend test `test_login_wrong_password` makes the refusal.
    await expectRefusedSignIn(page, PEOPLE.teachingAdmin, "wrong-password");
  });
});
