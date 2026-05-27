import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";
setup.setTimeout(120_000);

async function loginWithRateLimitRetry(
  page: Parameters<typeof setup>[0]["page"],
): Promise<void> {
  const submitLoginFromUi = async (): Promise<number | null> => {
    const usernameInput = page.getByLabel("Username");
    const passwordInput = page.getByLabel("Password");

    await expect(usernameInput).toBeVisible();
    await expect(passwordInput).toBeVisible();

    await usernameInput.fill("educator");
    await passwordInput.fill("educator123");

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
    await page.getByRole("button", { name: "Sign in" }).click();
    let status = await responsePromise;

    if (status !== null) {
      return status;
    }

    responsePromise = waitForLoginResponse();
    await passwordInput.press("Enter");
    status = await responsePromise;

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

    return responsePromise;
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto("/login");
    const status = await submitLoginFromUi();

    if (status === null && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    if (status === null) {
      throw new Error(`No setup login response received on attempt ${attempt}`);
    }

    if (status === 429 && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    if (status !== 200) {
      throw new Error(
        `Setup login returned status ${status} on attempt ${attempt}`,
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

    throw new Error(`Setup login did not redirect on attempt ${attempt}`);
  }
}

setup("authenticate", async ({ page }) => {
  await loginWithRateLimitRetry(page);

  await page.context().storageState({ path: authFile });
});
