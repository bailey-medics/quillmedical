import { test, expect, type Page } from "@playwright/test";

async function submitLogin(
  page: Page,
  username: string,
  password: string,
): Promise<number> {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );

  await page.getByRole("button", { name: "Sign in" }).click();
  const response = await responsePromise;
  return response.status();
}

async function loginWithRateLimitRetry(page: Page): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await submitLogin(page, "educator", "educator123");
    if (status === 200) {
      return;
    }

    if (status === 429 && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    throw new Error(
      `Valid login failed with status ${status} on attempt ${attempt}`,
    );
  }
}

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

    await loginWithRateLimitRetry(page);

    await expectSuccessfulLoginRedirect(page);
  });

  test("shows error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    const status = await submitLogin(page, "educator", "wrong-password");
    expect([400, 429]).toContain(status);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("body")).toContainText(
      /invalid|incorrect|too many|rate limit|login failed/i,
      {
        timeout: 10_000,
      },
    );
  });
});
