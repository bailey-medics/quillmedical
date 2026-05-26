import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";
setup.setTimeout(120_000);

async function submitLogin(
  page: Parameters<typeof setup>[0]["page"],
  username: string,
  password: string,
): Promise<number> {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").pressSequentially(password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/login") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );

  await page.getByLabel("Password").press("Enter");
  const response = await responsePromise;
  return response.status();
}

async function loginWithRateLimitRetry(
  page: Parameters<typeof setup>[0]["page"],
): Promise<void> {
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
      `Setup login failed with status ${status} on attempt ${attempt}`,
    );
  }
}

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  await loginWithRateLimitRetry(page);

  await expect
    .poll(
      () => {
        const pathname = new URL(page.url()).pathname;
        return pathname === "/" || pathname.startsWith("/teaching");
      },
      {
        timeout: 60_000,
        message: "Expected setup login to redirect to either / or /teaching",
      },
    )
    .toBe(true);
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
