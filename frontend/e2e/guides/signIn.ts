/**
 * Signs in as one of the people `backend/scripts/seed_guides.py` seeds.
 *
 * Each spec signs in as the person its guide is about, so a screenshot
 * shows what that reader would see: an operator's menu is not a
 * delegate's. The names are the script's, kept here so a spec says who it
 * is and not what their username happens to be.
 */

import { expect, type Page } from "@playwright/test";

/** The seeded accounts. Each password is the username followed by `123`. */
export const PEOPLE = {
  /** Operates Quill: `superadmin`, with `superadmin_profession`. */
  operator: "guide_operator",
  /** A teaching admin at the organisation. */
  teachingAdmin: "guide_admin",
  /** A delegate with no attempts, for specs that take a module. */
  learner: "guide_learner",
  /** Holds a passport with something in each of its parts. */
  passportHolder: "guide_holder",
  /** May keep a passport and has not started one. */
  passportStarter: "guide_starter",
  /** Named on the holder's sign-off requests, one of them still waiting. */
  passportAssessor: "guide_assessor",
  /** Runs the passport at the organisation. */
  passportAdmin: "guide_passport_admin",
  /** A safety officer, where the safety mock-up is switched on. */
  safetyOfficer: "guide_safety",
  /** A delegate who has passed, for the result and its certificate. */
  passedDelegate: "guide_delegate_1",
} as const;

/** What the seed calls its places, and the clinical lead's address. */
export const SEEDED = {
  organisation: "Northfield Endoscopy Academy",
  site: "Northfield General Hospital",
  clinicalLeadEmail: "guide_lead@northfield.example",
} as const;

export async function signIn(
  page: Page,
  username: (typeof PEOPLE)[keyof typeof PEOPLE],
): Promise<void> {
  // The login route is rate-limited, and the specs sign in one after
  // another, so a refusal is waited out and tried again.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page
      .getByRole("textbox", { name: "Password" })
      .fill(`${username}123`);

    const answered = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const status = (await answered).status();

    if (status === 200) {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
      return;
    }
    if (status !== 429) {
      throw new Error(`Signing in as ${username} answered ${status}`);
    }
    await page.waitForTimeout(2_000 * attempt);
  }
  throw new Error(`Signing in as ${username} was refused three times`);
}
