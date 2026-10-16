/**
 * Make a person for one test, as the seeded teaching admin.
 *
 * A test that changes somebody's settings, password or two-factor makes
 * its own person, so a retry and the other browser never meet the change.
 * They work at "CI Teaching Centre" and their password is their username
 * followed by `123`, as every seeded person's is, so `signIn` needs only
 * the username.
 */

import type { Browser } from "@playwright/test";
import { createAccount, orgUnitId } from "./api";
import { PLACES, freshUsername } from "./signIn";

/** The seeded teaching admin's saved sign-in, from `auth.setup.ts`. */
export const TEACHING_ADMIN_STATE = "e2e/.auth/user.json";

/** The two professions the teaching journeys are tested for. */
export const TEACHING_PEOPLE = [
  { who: "a TA", kind: "ta", profession: "teaching_admin" },
  { who: "a TD", kind: "td", profession: "teaching_delegate" },
] as const;

/** Make somebody of *profession*, and return their username. */
export async function makePerson(
  browser: Browser,
  prefix: string,
  project: string,
  profession: string,
): Promise<string> {
  const username = freshUsername(prefix, project);
  const context = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });
  const page = await context.newPage();

  await createAccount(page, {
    username,
    name: `Person ${username}`,
    profession,
    password: `${username}123`,
    orgUnitIds: [await orgUnitId(page, PLACES.site)],
  });
  await context.close();

  return username;
}
