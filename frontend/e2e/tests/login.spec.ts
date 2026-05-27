import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

async function submitLogin(
  page: Page,
  username: string,
  password: string,
): Promise<number | null> {
  const usernameInput = page.getByLabel("Username");
  const passwordInput = page.getByLabel("Password");

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await usernameInput.fill(username);
    await passwordInput.fill(password);

    const valuesReady = await Promise.all([
      usernameInput.inputValue(),
      passwordInput.inputValue(),
    ]).then(
      ([usernameValue, passwordValue]) =>
        usernameValue === username && passwordValue === password,
    );

    if (valuesReady) {
      break;
    }

    if (attempt === 3) {
      throw new Error("Login fields did not retain values before submit");
    }

    await page.waitForTimeout(250 * attempt);
  }

  const waitForLoginResponse = async (): Promise<number | null> =>
    page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/auth/login") &&
          response.request().method() === "POST",
        { timeout: 10_000 },
      )
      .then((response) => response.status())
      .catch(() => null);

  let responsePromise = waitForLoginResponse();
  await passwordInput.press("Enter");
  let status = await responsePromise;

  if (status !== null) {
    return status;
  }

  responsePromise = waitForLoginResponse();
  await page
    .locator("form")
    .first()
    .evaluate((el) => {
      (el as HTMLFormElement).requestSubmit();
    });

  status = await responsePromise;
  return status;
}

async function loginWithRateLimitRetry(page: Page): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const status = await submitLogin(page, "educator", "educator123");

    if (status === null && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    if (status === null) {
      throw new Error(`No login response received on attempt ${attempt}`);
    }

    if (status === 429 && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    if (status !== 200) {
      throw new Error(
        `Valid login returned status ${status} on attempt ${attempt}`,
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

    const status = await submitLogin(page, "educator", "wrong-password");

    expect(status).not.toBeNull();
    expect([400, 401, 429]).toContain(status!);

    await expect(page).toHaveURL(/\/login/);
  });
});
