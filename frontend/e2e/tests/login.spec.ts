import { test, expect, type Page, type Response } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

async function submitLogin(
  page: Page,
  username: string,
  password: string,
): Promise<Response | null> {
  const usernameInput = page.getByLabel("Username");
  const passwordInput = page.getByLabel("Password");

  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const waitForLoginResponse = async (): Promise<Response | null> =>
    page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/auth/login") &&
          response.request().method() === "POST",
        { timeout: 10_000 },
      )
      .catch(() => null);

  let responsePromise = waitForLoginResponse();
  await passwordInput.press("Enter");
  let response = await responsePromise;

  if (response) {
    return response;
  }

  responsePromise = waitForLoginResponse();
  await page
    .locator("form")
    .first()
    .evaluate((el) => {
      (el as HTMLFormElement).requestSubmit();
    });

  response = await responsePromise;
  return response;
}

async function loginWithRateLimitRetry(page: Page): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await submitLogin(page, "educator", "educator123");

    if (!response) {
      throw new Error(`No login response received on attempt ${attempt}`);
    }

    if (response.status() === 429 && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    if (response.status() !== 200) {
      throw new Error(
        `Valid login returned status ${response.status()} on attempt ${attempt}`,
      );
    }

    const isRedirected = await expect
      .poll(
        () => {
          const pathname = new URL(page.url()).pathname;
          return pathname === "/" || pathname.startsWith("/teaching");
        },
        { timeout: 15_000 },
      )
      .toBe(true)
      .then(
        () => true,
        () => false,
      );

    if (isRedirected) {
      return;
    }

    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    const hitRateLimit =
      bodyText.includes("rate limit") || bodyText.includes("too many");

    if (hitRateLimit && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    throw new Error(`Valid login did not redirect on attempt ${attempt}`);
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

    const response = await submitLogin(page, "educator", "wrong-password");

    expect(response).not.toBeNull();
    expect([400, 401, 429]).toContain(response!.status());

    await expect(page).toHaveURL(/\/login/);
  });
});
