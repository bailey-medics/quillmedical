import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";
setup.setTimeout(120_000);

async function loginWithRateLimitRetry(
  page: Parameters<typeof setup>[0]["page"],
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Username").fill("educator");
    await page.getByLabel("Password").fill("educator123");

    await expect(page.getByLabel("Username")).toHaveValue("educator");
    await expect(page.getByLabel("Password")).toHaveValue("educator123");

    await page
      .locator("form")
      .first()
      .evaluate((el) => {
        (el as HTMLFormElement).requestSubmit();
      });

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

    throw new Error(`Setup login did not redirect on attempt ${attempt}`);
  }
}

setup("authenticate", async ({ page }) => {
  await loginWithRateLimitRetry(page);

  await page.context().storageState({ path: authFile });
});
