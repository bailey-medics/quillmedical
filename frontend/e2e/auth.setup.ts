import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("educator");
  await page.getByLabel("Password").fill("educator123");
  await page.getByLabel("Password").blur();

  const submitBtn = page.getByRole("button", { name: "Sign in" });
  await expect(submitBtn).toBeEnabled({ timeout: 10000 });
  await submitBtn.click();

  await page.waitForURL("**/teaching");
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().storageState({ path: authFile });
});
