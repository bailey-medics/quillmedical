/**
 * Screenshots for the guide "Sign somebody off".
 *
 * Taken as the seeded assessor, who has one request waiting. The form is
 * opened and left unsigned, so the request is there for the next run too.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("sign somebody off", async ({ page }) => {
  await signIn(page, PEOPLE.passportAssessor);

  await page.goto("/inbox");
  const request = page.getByText(/Sign-off request from/).first();
  await expect(request).toBeVisible();
  await shot(page, "sign-somebody-off/inbox");

  await request.click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign off" }),
  ).toBeVisible();
  await expect(page.getByText("What did you do?")).toBeVisible();
  await shot(page, "sign-somebody-off/sign-off");
});
