/**
 * A user manager creates somebody with their practice already set.
 *
 * The new user form has a Practice step: where each competency the person
 * will hold may be used. A competency with nothing switched on authorises
 * nothing, so before the step a new starter could do nothing until
 * somebody opened the organisation's staff table and switched them on.
 * This creates a teaching delegate at the seeded organisation with their
 * one competency switched on, then opens their page at the organisation
 * and finds it authorised.
 *
 * Signs in as `usermanager`, seeded by `backend/scripts/seed_ci.py`. Every
 * run makes a new person, named for the browser project and the time, so
 * a retry and the other project never meet an account that already
 * exists.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures/axe";

const ORGANISATION = "CI Teaching Hospital";
const PROFESSION = "Teaching delegate";
const COMPETENCY = "Take Teaching Modules";

async function signInAsUserManager(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("usermanager");
  await page.getByRole("textbox", { name: "Password" }).fill("usermanager123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

test.describe("User form practice", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 90_000 });

  test("create somebody with a competency switched on where they work", async ({
    page,
  }, testInfo) => {
    const username = `formed_${testInfo.project.name}_${Date.now()}`;
    // The stepper's own button, matched whole: the practice table pages
    // its rows, and its "next page" button would match a looser name.
    const next = page.getByRole("button", { name: "Next", exact: true });

    await signInAsUserManager(page);
    await page.goto("/admin/users/new");

    // Basic details
    await page.getByLabel("Full name").fill("Formed By Test");
    await page.getByLabel("Email").fill(`${username}@example.test`);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Initial password").fill("FormedByTest123!");
    await page.getByRole("combobox", { name: "Base profession" }).click();
    await page.getByRole("option", { name: PROFESSION, exact: true }).click();
    await next.click();

    // Organisation/site
    await page.getByRole("combobox", { name: /^Organisation/ }).click();
    await page.getByRole("option", { name: ORGANISATION }).click();
    // Close the list, which stays open over the button for more choices.
    await page.keyboard.press("Escape");
    await next.click();

    // Competencies: the profession's own, unchanged.
    await expect(
      page.getByRole("heading", { name: "Competency configuration" }),
    ).toBeVisible();
    await next.click();

    // Practice: one card for the organisation, everything off.
    await expect(
      page.getByRole("heading", { name: ORGANISATION, level: 2 }),
    ).toBeVisible();
    const toggle = page.getByRole("switch", {
      name: `${COMPETENCY} at ${ORGANISATION}: may practise here`,
    });
    await expect(toggle).not.toBeChecked();
    // The switch's input is visually hidden, so click its track.
    await page
      .locator(`label[for="${await toggle.getAttribute("id")}"]`)
      .click();
    await expect(toggle).toBeChecked();
    // No `scanPage` here: it reloads the page to scan each colour
    // scheme, and a reload empties the form. The step's cards are
    // scanned in Storybook, as `PracticeByPlaceEditor`'s stories.
    await next.click();

    // Enrolment: the organisation serves teaching modules and the user
    // manager runs teaching, so the step is offered. Nothing is ticked.
    // There is no Platform role step for them: they are not an operator.
    await expect(
      page
        .getByRole("checkbox", { name: new RegExp(` at ${ORGANISATION}$`) })
        .first(),
    ).toBeVisible();
    // Then the review names what was switched on.
    await next.click();
    await expect(page.getByText(`May practise: ${COMPETENCY}`)).toBeVisible();
    await page.getByRole("button", { name: "Create user" }).click();
    // Saving goes back to the list of users, which says what happened.
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByText("User created")).toBeVisible();

    // Their page at the organisation shows it authorised, with nobody
    // having opened the staff table to switch it on.
    await page.goto("/admin/organisations");
    await page.getByText(ORGANISATION).click();
    await page.getByRole("row", { name: new RegExp(username) }).click();
    await expect(page).toHaveURL(/\/admin\/organisations\/\d+\/members\/\d+$/);
    await expect(
      page.getByRole("switch", { name: `${COMPETENCY}: may practise here` }),
    ).toBeChecked();
  });
});
