/**
 * Who the end-to-end tests sign in as, and the places they act on.
 *
 * The names are those `backend/scripts/seed_ci.py` seeds, kept here so a
 * spec says who it is and not what their username happens to be. Each
 * password is the username followed by `123`.
 *
 * Most specs need no sign-in at all: every browser project starts signed
 * in as `educator`, the teaching admin, through the storage state
 * `auth.setup.ts` saves. A spec that needs somebody else clears that
 * state with `test.use({ storageState: { cookies: [], origins: [] } })`
 * and calls `signIn`.
 */

import { expect, type Page } from "@playwright/test";

/** The seeded accounts. */
export const PEOPLE = {
  /** Operates Quill: `superadmin`. */
  superuser: "admin",
  /**
   * A `teaching_admin`: holds `manage_teaching` and not `manage_users`,
   * as a teaching admin at a partner does. The default signed-in user.
   */
  teachingAdmin: "educator",
} as const;

/** What the seed calls its places. */
export const PLACES = {
  /** The teaching organisation, where the teaching admin is staff. */
  organisation: "CI Teaching Hospital",
  /** A site inside it, where the teaching admin is staff too. */
  site: "CI Teaching Centre",
  /** An organisation the teaching admin belongs nowhere in. */
  otherOrganisation: "CI Other Hospital",
  /** A site inside that one. */
  otherSite: "CI Other Centre",
} as const;

/**
 * Sign in through the login form as one of the seeded people.
 *
 * The login route is rate-limited and the browser projects sign in side
 * by side, so a refusal is waited out and tried again.
 */
export async function signIn(
  page: Page,
  username: string,
  password = `${username}123`,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto("/login");
    await page.getByLabel("Username").fill(username);
    await page.getByRole("textbox", { name: "Password" }).fill(password);

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

/** A username no earlier run or other browser project has used. */
export function freshUsername(prefix: string, project: string): string {
  return `${prefix}_${project}_${Date.now()}`;
}
