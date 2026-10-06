/**
 * Screenshots for the guide "Start your passport".
 *
 * The first picture is of somebody with no passport yet, the second of
 * the seeded holder's.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("start your passport", async ({ page }) => {
  await signIn(page, PEOPLE.passportStarter);

  await page.goto("/passport");
  await expect(page.getByText("You do not have a passport yet")).toBeVisible();
  await shot(page, "start-your-passport/create");
});

test("a passport with something in it", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);
  await page.goto("/passport");
  await expect(page.getByText("Open sign-offs")).toBeVisible();
  await shot(page, "start-your-passport/passport");
});
