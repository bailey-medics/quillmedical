/**
 * Make a person for one test, as the seeded teaching admin.
 *
 * A test that changes somebody's settings, password or two-factor makes
 * its own person, so a retry and the other browser never meet the change.
 * They work at "CI Teaching Centre" and their password is their username
 * followed by `123`, as every seeded person's is, so `signIn` needs only
 * the username.
 */

import { expect, type Browser } from "@playwright/test";
import { MODULE_ID } from "./answers";
import { createAccount, orgUnitId, send } from "./api";
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

/**
 * Make a learner able to take the module, as the teaching admin, at a
 * site of their own with a clinical lead of its own.
 *
 * A lead of their own, because a pass emails the clinical leads, and
 * `send_email` allows ten emails an hour to one address: a lead shared by
 * every journey would run past that, and the email a test checks would
 * not be sent. Their password is their username followed by `123`.
 *
 * Returns the id of the site made for them.
 */
export async function makeLearner(
  browser: Browser,
  username: string,
  profession: string,
): Promise<number> {
  const context = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });
  const page = await context.newPage();
  const organisationId = await orgUnitId(page, PLACES.organisation);

  const site = await send(page, "POST", "/org-units", {
    name: `Site of ${username}`,
    type: "site",
    parent_id: organisationId,
  });
  expect(site.status(), await site.text()).toBe(200);
  const siteId = ((await site.json()) as { id: number }).id;

  const leadId = await createAccount(page, {
    username: leadOf(username),
    name: `Lead of ${username}`,
    profession: "teaching_clinical_lead",
    orgUnitIds: [siteId],
  });
  const named = await send(page, "PUT", `/org-units/${siteId}/clinical-lead`, {
    user_id: leadId,
  });
  expect(named.status(), await named.text()).toBe(200);

  await createAccount(page, {
    username,
    name: `Learner ${username}`,
    profession,
    password: `${username}123`,
    orgUnitIds: [siteId],
    takesModule: { siteId, organisationId, moduleId: MODULE_ID },
  });
  await context.close();

  return siteId;
}

/** The username of a learner's own clinical lead. */
export function leadOf(username: string): string {
  return `${username}_lead`;
}
