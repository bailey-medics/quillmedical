import { test as setup, expect, type Response } from "@playwright/test";

const authFile = "e2e/.auth/user.json";
setup.setTimeout(120_000);

async function loginWithRateLimitRetry(
  page: Parameters<typeof setup>[0]["page"],
): Promise<void> {
  const submitLogin = async (): Promise<Response | null> => {
    await page.getByLabel("Username").fill("educator");
    const passwordInput = page.getByLabel("Password");
    await passwordInput.fill("educator123");

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
  };

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto("/login");
    const response = await submitLogin();

    if (!response) {
      throw new Error(`No setup login response received on attempt ${attempt}`);
    }

    if (response.status() === 429 && attempt < maxAttempts) {
      await page.waitForTimeout(1_000 * attempt);
      continue;
    }

    if (response.status() !== 200) {
      throw new Error(
        `Setup login returned status ${response.status()} on attempt ${attempt}`,
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
