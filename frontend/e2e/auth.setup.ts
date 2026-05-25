import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("educator");
  await page.getByLabel("Password").fill("educator123");
  await page.getByLabel("Password").press("Enter");

  await page.waitForURL("**/teaching");
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
