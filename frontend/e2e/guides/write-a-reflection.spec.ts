/**
 * Screenshots for the guide "Write a reflection".
 *
 * Taken of the passport `backend/scripts/seed_guides.py` gives its holder.
 * Forms are opened and left unsaved: the pictures are of the forms.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("write a reflection", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  await page.goto("/passport/reflections");
  await expect(page.getByText("Consent when time is short")).toBeVisible();
  await shot(page, "write-a-reflection/reflections");

  await page.getByRole("button", { name: "Write a reflection" }).click();
  await expect(
    page.getByText("I confirm this reflection is anonymised"),
  ).toBeVisible();
  await shot(page, "write-a-reflection/reflection");
});
