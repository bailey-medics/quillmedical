/**
 * Screenshots for the guide "Download your passport".
 *
 * Taken of the passport `backend/scripts/seed_guides.py` gives its holder.
 * Forms are opened and left unsaved: the pictures are of the forms.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("download your passport", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  await page.goto("/passport/download");
  await expect(page.getByText("Take your record with you")).toBeVisible();
  await shot(page, "download-your-passport/download");
});
