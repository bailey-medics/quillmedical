/**
 * Screenshots for the guide "Start your passport".
 *
 * The first picture is of somebody with no passport yet, the second of
 * the seeded holder's in the By competency view it opens in, and the
 * third of the same passport by record.
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
  // The By competency view, which every passport opens in until its
  // holder chooses otherwise: a table for the framework they work to.
  await expect(
    page.getByRole("heading", { name: "General clinical skills" }),
  ).toBeVisible();
  await shot(page, "start-your-passport/passport");
});

test("the same passport by record", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  // Chosen in Settings, as the guide says, and put back afterwards so
  // the seeded holder still opens By competency for any later picture.
  await page.goto("/settings");
  await page.getByRole("radio", { name: "By record" }).check();
  await page.goto("/passport");
  await expect(page.getByText("Open sign-offs")).toBeVisible();
  await shot(page, "start-your-passport/by-record");

  await page.goto("/settings");
  await page.getByRole("radio", { name: "By competency" }).check();
});
