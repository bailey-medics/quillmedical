/**
 * Screenshots for the guide "Keep your logbook".
 *
 * Taken of the passport `backend/scripts/seed_guides.py` gives its holder.
 * Forms are opened and left unsaved: the pictures are of the forms.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("keep your logbook", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  await page.goto("/passport/logbook");
  await expect(page.getByText("Acute medical unit")).toBeVisible();
  await shot(page, "keep-your-logbook/logbook");

  await page.getByRole("button", { name: "Add an entry" }).click();
  await page.getByPlaceholder("Search competencies").click();
  await page.getByPlaceholder("Search competencies").fill("lumbar");
  await page.getByRole("option").first().click();
  await expect(page.getByText("Performed on").first()).toBeVisible();
  await shot(page, "keep-your-logbook/entry");
});
