/**
 * Screenshots for the guide "Add a certificate".
 *
 * Taken of the passport `backend/scripts/seed_guides.py` gives its holder.
 * Forms are opened and left unsaved: the pictures are of the forms.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("add a certificate", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  await page.goto("/passport/certificates");
  await expect(page.getByText("Advanced Life Support")).toBeVisible();
  await shot(page, "add-a-certificate/certificates");

  await page.getByRole("button", { name: "Record a certificate" }).click();
  await expect(page.getByText("Who issued it?")).toBeVisible();
  await shot(page, "add-a-certificate/certificate");
});
