/**
 * Screenshots for the guide "Ask for a sign-off".
 *
 * Taken of the passport `backend/scripts/seed_guides.py` gives its holder.
 * Forms are opened and left unsaved: the pictures are of the forms.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("ask for a sign-off", async ({ page }) => {
  await signIn(page, PEOPLE.passportHolder);

  await page.goto("/passport/sign-offs");
  await expect(page.getByText("Awaiting sign-off")).toBeVisible();
  await shot(page, "ask-for-a-sign-off/sign-offs");

  // The signed one, opened from the list.
  await page.getByText("Signed off by").first().click();
  await expect(page.getByText("Basis")).toBeVisible();
  await shot(page, "ask-for-a-sign-off/signed");

  await page.goto("/passport/sign-offs");
  await page.getByRole("button", { name: "Ask for a sign-off" }).click();
  await page.getByPlaceholder("Search competencies").click();
  await page.getByRole("option").first().click();
  const assessor = page.getByLabel(/Who should assess this/);
  await expect(assessor).toBeVisible();
  await assessor.fill("guide_assessor@northfield.example");
  await expect(page.getByText(/already uses Quill/)).toBeVisible();
  await shot(page, "ask-for-a-sign-off/request");
});
