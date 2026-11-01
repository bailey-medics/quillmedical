/**
 * Signs in once as `educator`, the seeded teaching admin, and saves the
 * session every browser project starts with.
 *
 * Through the login form, as a person does, and waiting out the rate
 * limit by what the page says: see `signIn` in `fixtures/signIn.ts`.
 */

import { test as setup } from "@playwright/test";
import { PEOPLE, signIn } from "./fixtures/signIn";

const authFile = "e2e/.auth/user.json";
setup.setTimeout(120_000);

setup("authenticate", async ({ page }) => {
  await signIn(page, PEOPLE.teachingAdmin);

  await page.context().storageState({ path: authFile });
});
