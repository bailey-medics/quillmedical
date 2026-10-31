/**
 * Make the people the passport journeys act on, as the passport admin.
 *
 * Every holder and assessor is made fresh for one test, named for the
 * browser project and the time, so nothing is shared between tests,
 * browsers or retries. A fresh person also has a fresh inbox, and
 * `send_email` refuses an eleventh email to one address in an hour.
 *
 * They are made by `ci_passport_admin`, the seeded passport admin of "CI
 * Passport Hospital", and never by the operator: in real life the
 * superadmin should do the least setting up there is. See Phase 6 of
 * docs/docs/plans/2026-10-31-passport-landing-views-plan.md.
 *
 * Each works at "CI Passport Centre", and their password is their username
 * followed by `123`, so `signIn` needs only the username.
 */

import { expect, type Browser, type Page } from "@playwright/test";
import { createAccount, orgUnitId, send } from "./api";
import { PEOPLE, PLACES, freshUsername, signIn } from "./signIn";

/**
 * The frameworks a holder is given unless a test says otherwise: the
 * general one and the Gloucestershire radiotherapy record, so the By
 * competency view draws two tables.
 */
export const HOLDER_FRAMEWORKS = ["clinical", "ghnft_radiotherapy_record"];

/** Their display names, as the tables are headed. */
export const FRAMEWORK_NAMES = {
  clinical: "General clinical skills",
  ghnft_radiotherapy_record:
    "Clinical oncology registrar record of radiotherapy training and competence",
} as const;

/** A person made for one test. */
export interface PassportPerson {
  /** Their user id, for the passport admin's own changes to them. */
  id: number;
  username: string;
  /** Their address, where any email to them is captured. */
  email: string;
}

/** A holder, with the id of the passport made for them, if one was. */
export interface Holder extends PassportPerson {
  passportId: string | null;
}

/**
 * The address a passport person is given.
 *
 * `example.com`, not the `example.test` most journeys use: a sign-off
 * request refuses an assessor address on a reserved name such as
 * `.test`, as registration and forgot password do. Nothing is sent: the
 * stack captures it.
 */
export function passportEmailOf(username: string): string {
  return `${username}@example.com`;
}

/** Sign a fresh browser context in as the passport admin. */
export async function asPassportAdmin(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await signIn(page, PEOPLE.passportAdmin);

  return page;
}

/**
 * Make somebody at the passport site, as the passport admin.
 *
 * A `passport_delegate`, the profession that opens the passport.
 * `writes` grants `passport_write` as well, as a passport admin does for
 * the people they take on.
 */
async function makePassportPerson(
  browser: Browser,
  prefix: string,
  project: string,
  writes: boolean,
): Promise<PassportPerson> {
  const username = freshUsername(prefix, project);
  const email = passportEmailOf(username);
  const page = await asPassportAdmin(browser);

  const id = await createAccount(page, {
    username,
    name: `Person ${username}`,
    email,
    profession: "passport_delegate",
    password: `${username}123`,
    orgUnitIds: [await orgUnitId(page, PLACES.passportSite)],
    competencies: writes ? ["passport_write"] : [],
  });
  await page.context().close();

  return { id, username, email };
}

/**
 * Make a holder who may write to their passport.
 *
 * With `passport: false` they have none yet, for the journey that creates
 * one. Otherwise one is made through the API, as them, working to
 * *frameworks*.
 */
export async function makeHolder(
  browser: Browser,
  project: string,
  {
    passport = true,
    frameworks = HOLDER_FRAMEWORKS,
  }: { passport?: boolean; frameworks?: string[] } = {},
): Promise<Holder> {
  const person = await makePassportPerson(browser, "ph", project, true);

  if (!passport) return { ...person, passportId: null };

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, person.username);

  const made = await send(page, "POST", "/passport", { frameworks });
  expect(made.status(), await made.text()).toBe(201);
  const passportId = ((await made.json()) as { passport_id: string })
    .passport_id;
  await context.close();

  return { ...person, passportId };
}

/**
 * Make an assessor: somebody at the same site who may sign off other
 * people's competencies, with no passport of their own.
 */
export async function makeAssessor(
  browser: Browser,
  project: string,
): Promise<PassportPerson> {
  return makePassportPerson(browser, "as", project, false);
}
