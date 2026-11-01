/**
 * Make the people the passport journeys act on, and do what they do,
 * through the screen.
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
 * Nothing here calls the API. The passport admin adds each person on the
 * add-user form, and everything a holder, an assessor or the passport
 * admin then does is done on screen, as Phases 7 and 9 of the same plan
 * set out.
 *
 * Each works at "CI Passport Centre", and their password is their username
 * followed by `123`, so `signIn` needs only the username.
 */

import {
  expect,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { PEOPLE, PLACES, freshUsername, signIn } from "./signIn";

/**
 * The frameworks a holder is given unless a test says otherwise: the
 * general one and the Gloucestershire radiotherapy record, so the By
 * competency view draws two tables.
 */
export const HOLDER_FRAMEWORKS = [
  "clinical",
  "ghnft_radiotherapy_record",
] as const;

/** A framework a holder may be given here. */
export type FrameworkId = (typeof HOLDER_FRAMEWORKS)[number];

/** Their display names, as the tables are headed. */
export const FRAMEWORK_NAMES: Record<FrameworkId, string> = {
  clinical: "General clinical skills",
  ghnft_radiotherapy_record:
    "Clinical oncology registrar record of radiotherapy training and competence",
};

/**
 * A competency in the Gloucestershire radiotherapy record with no levels
 * and no scopes, so a sign-off of it asks for nothing beyond the
 * assessor and the date.
 */
export const REFER_PALLIATIVE = {
  id: "ghnft_radiotherapy_record_refer_palliative",
  name: "Refer patients for palliative radiotherapy unsupervised",
};

/** How the catalogue names `passport_write` in a picker. */
export const PASSPORT_WRITE = "Hold and Write a Clinician Passport";

/** A day in the past, as the date fields are typed. */
export const A_DAY_LAST_MONTH = "1 October 2026";

/** A person made for one test. */
export interface PassportPerson {
  /** Their user id, for the passport admin's edit page. */
  id: number;
  username: string;
  /** Their address, where any email to them is captured. */
  email: string;
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

/** Sign a fresh browser context in as *username*, and return its page. */
export async function pageAs(
  browser: Browser,
  username: string,
  password?: string,
): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await signIn(page, username, password);

  return page;
}

/** Sign a fresh browser context in as the passport admin. */
export async function asPassportAdmin(browser: Browser): Promise<Page> {
  return pageAs(browser, PEOPLE.passportAdmin);
}

/** Click Next on the user form until *target* shows. */
async function stepTo(page: Page, target: Locator): Promise<void> {
  const next = page.getByRole("button", { name: "Next", exact: true });

  while (!(await target.isVisible())) {
    await next.click();
  }
}

/**
 * The id of *username*, found as an admin finds anybody: searching the
 * users list on *page* and opening their page.
 */
async function idFromTheList(page: Page, username: string): Promise<number> {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByPlaceholder(/Search/).fill(username);
  // The username, not a table row: on a phone the list draws cards.
  await page.getByText(username, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);

  return Number(new URL(page.url()).pathname.split("/").pop());
}

/**
 * As the passport admin on *admin*, add somebody at the passport site on
 * the add-user form, as a trust's passport admin does.
 *
 * A `passport_delegate`, the profession that opens the passport.
 * `writes` grants `passport_write` as well, as a passport admin does for
 * the people they take on. Returns their id, read from their page in the
 * users list, for the edit page.
 */
export async function addOnTheForm(
  admin: Page,
  username: string,
  email: string,
  writes: boolean,
): Promise<number> {
  const site = admin.getByRole("combobox", { name: "Site" });
  const held = admin.getByRole("combobox", {
    name: "Held beyond the profession",
  });
  const create = admin.getByRole("button", { name: "Create user" });

  await admin.goto("/admin/users/new");
  await admin.getByLabel("Full name").fill(`Person ${username}`);
  await admin.getByLabel("Email").fill(email);
  await admin.getByLabel("Username").fill(username);
  await admin.getByLabel("Initial password").fill(`${username}123`);
  await admin.getByRole("combobox", { name: "Base profession" }).click();
  await admin
    .getByRole("option", { name: "Passport delegate", exact: true })
    .click();

  await stepTo(admin, site);
  await site.click();
  await admin.getByRole("option", { name: PLACES.passportSite }).click();
  await admin.keyboard.press("Escape");

  if (writes) {
    await stepTo(admin, held);
    await held.click();
    await admin.getByRole("option", { name: PASSPORT_WRITE }).click();
    await admin.keyboard.press("Escape");
  }

  await stepTo(admin, create);
  await create.click();
  await expect(admin.getByText("User created")).toBeVisible();

  return idFromTheList(admin, username);
}

/** Make somebody at the passport site, as the passport admin. */
async function makePassportPerson(
  browser: Browser,
  prefix: string,
  project: string,
  writes: boolean,
): Promise<PassportPerson> {
  const username = freshUsername(prefix, project);
  const email = passportEmailOf(username);
  const admin = await asPassportAdmin(browser);

  const id = await addOnTheForm(admin, username, email, writes);
  await admin.context().close();

  return { id, username, email };
}

/**
 * Choose *frameworks* in the "Frameworks you work to" field, on the
 * passport's create page or in Settings. Choosing one already chosen
 * takes it off again.
 */
export async function toggleFrameworks(
  page: Page,
  frameworks: readonly FrameworkId[],
): Promise<void> {
  await page.getByRole("combobox", { name: /Frameworks you work to/ }).click();

  for (const id of frameworks) {
    await page
      .getByRole("option", { name: new RegExp(FRAMEWORK_NAMES[id]) })
      .click();
  }

  await page.keyboard.press("Escape");
}

/**
 * Create the signed-in person's passport on the page that offers it,
 * working to *frameworks*. Story 1 checks that page in detail; this is
 * the same steps, for every other journey's way in.
 */
export async function createPassport(
  page: Page,
  frameworks: readonly FrameworkId[] = HOLDER_FRAMEWORKS,
): Promise<void> {
  await page.goto("/passport");
  await expect(page.getByText("You do not have a passport yet")).toBeVisible();
  await toggleFrameworks(page, frameworks);
  await page.getByRole("button", { name: "Create my passport" }).click();

  await expect(
    page.getByRole("heading", { name: FRAMEWORK_NAMES[frameworks[0]] }),
  ).toBeVisible();
}

/**
 * Make a holder who may write to their passport.
 *
 * With `passport: false` they have none yet, for the journey that creates
 * one. Otherwise they create one on screen, working to *frameworks*.
 */
export async function makeHolder(
  browser: Browser,
  project: string,
  {
    passport = true,
    frameworks = HOLDER_FRAMEWORKS,
  }: { passport?: boolean; frameworks?: readonly FrameworkId[] } = {},
): Promise<PassportPerson> {
  const person = await makePassportPerson(browser, "ph", project, true);

  if (!passport) return person;

  const page = await pageAs(browser, person.username);
  await createPassport(page, frameworks);
  await page.context().close();

  return person;
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

/** The row of the landing page's tables naming *competency*. */
export function rowOf(page: Page, competency: string): Locator {
  return page.getByRole("row").filter({ hasText: competency });
}

/** Type a date into the date field labelled *label*, and leave it. */
export async function fillDate(
  page: Page,
  label: string,
  day: string,
): Promise<void> {
  const field = page.getByRole("textbox", { name: label, exact: true });

  await field.fill(day);
  await field.press("Tab");
}

/** Open *competency*'s page from its row on the landing page. */
export async function openCompetency(
  page: Page,
  competency: string = REFER_PALLIATIVE.name,
): Promise<void> {
  await page.goto("/passport");
  await rowOf(page, competency).click();

  await expect(
    page.getByRole("heading", { level: 1, name: competency }),
  ).toBeVisible();
}

/** From the landing page, add a logbook entry to *competency*. */
export async function addLogbookEntry(
  page: Page,
  competency: string = REFER_PALLIATIVE.name,
): Promise<void> {
  await openCompetency(page, competency);
  await page.getByRole("button", { name: "Add an entry" }).click();
  await fillDate(page, "Performed on", A_DAY_LAST_MONTH);
  await page.getByRole("button", { name: "Add entry" }).click();

  await expect(page.getByText("1 entry")).toBeVisible();
}

/** From a competency's page, ask *email* to sign it off. */
export async function askForSignOff(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: "Ask for a sign-off" }).click();
  await page.getByLabel(/Who should assess this/).fill(email);

  // The form looks the address up and says what it found, a line that
  // pushes the button down when it lands. Wait for it, so the click below
  // is not aimed at where the button was.
  await expect(
    page.getByText(/already uses Quill|Nobody on Quill uses that address/),
  ).toBeVisible();
  await fillDate(page, "Observed on", A_DAY_LAST_MONTH);
  await page.getByRole("button", { name: "Request sign-off" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send request" })
    .click();

  await expect(page.getByRole("heading", { name: "Sign-offs" })).toBeVisible();
}

/**
 * As *holder*, in a browser of their own, ask *email* to sign off the
 * competency from its page, as story 4 does.
 */
export async function askAsHolder(
  browser: Browser,
  holder: PassportPerson,
  email: string,
): Promise<void> {
  const page = await pageAs(browser, holder.username);

  await openCompetency(page);
  await askForSignOff(page, email);
  await page.context().close();
}

/** Write a reflection called *title*, as story 10 does. */
export async function writeReflection(
  page: Page,
  title: string,
): Promise<void> {
  await page.goto("/passport/reflections");
  await page.getByRole("button", { name: "Write a reflection" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await fillDate(page, "Written on", A_DAY_LAST_MONTH);
  await page
    .getByRole("textbox", { name: "Your reflection" })
    .fill("What I would do differently next time.");
  await page
    .getByRole("checkbox", { name: "I confirm this reflection is anonymised" })
    .check();
  await page.getByRole("button", { name: "Save reflection" }).click();

  await expect(page.getByText(title).first()).toBeVisible();
}

/** Record a CPD activity called *title*, as story 8 does. */
export async function recordCpd(page: Page, title: string): Promise<void> {
  await page.goto("/passport/cpd");
  await page.getByRole("button", { name: "Add an activity" }).click();
  await fillDate(page, "Date", A_DAY_LAST_MONTH);
  await page.getByRole("textbox", { name: "What was it?" }).fill(title);
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Teaching day" }).click();
  await page.getByLabel("Points").fill("6");
  await page.getByRole("button", { name: "Record activity" }).click();

  await expect(page.getByText(title)).toBeVisible();
}

/** Open a page until a change shows: shared with the other specs. */
export { openUntil } from "./screen";

/**
 * As the passport admin, open *userId*'s edit page, do *change* on the
 * step that shows *field*, and save, as story 17 does.
 */
export async function editAsPassportAdmin(
  browser: Browser,
  userId: number,
  field: string,
  change: (admin: Page, field: Locator) => Promise<void>,
  beforeSaving?: (admin: Page) => Promise<void>,
): Promise<void> {
  const admin = await asPassportAdmin(browser);
  const target = admin.getByRole("combobox", { name: field });
  const save = admin.getByRole("button", { name: "Update user" });

  await admin.goto(`/admin/users/${userId}/edit`);
  await stepTo(admin, target);
  await change(admin, target);
  await stepTo(admin, save);
  await beforeSaving?.(admin);
  await save.click();
  await expect(admin.getByText("User updated")).toBeVisible();

  await admin.context().close();
}

/**
 * Give *userId* `passport_write`, or take it away: the same click on the
 * same option, which is chosen or not.
 */
export async function togglePassportWrite(
  browser: Browser,
  userId: number,
): Promise<void> {
  await editAsPassportAdmin(
    browser,
    userId,
    "Held beyond the profession",
    async (admin, field) => {
      await field.click();
      await admin.getByRole("option", { name: PASSPORT_WRITE }).click();
      await admin.keyboard.press("Escape");
    },
  );
}

/**
 * Take *userId* off the passport site, their one place. The Review step
 * warns first that the passport admin will no longer see them.
 */
export async function removeFromThePassportSite(
  browser: Browser,
  userId: number,
): Promise<void> {
  await editAsPassportAdmin(
    browser,
    userId,
    "Site",
    async (admin, field) => {
      await field.click();
      await admin.getByRole("option", { name: PLACES.passportSite }).click();
      await admin.keyboard.press("Escape");
    },
    async (admin) => {
      await expect(
        admin.getByText("They will leave your organisation"),
      ).toBeVisible();
      await expect(
        admin.getByText("You will no longer be able to see or edit them."),
      ).toBeVisible();
    },
  );
}

/**
 * The id of *username*, found as the operator finds anybody: searching
 * the users list and opening their page. A lookup, not setting anything
 * up, which is why the operator may do it.
 */
export async function userIdFromTheList(
  browser: Browser,
  username: string,
): Promise<number> {
  const page = await pageAs(browser, PEOPLE.superuser);
  const id = await idFromTheList(page, username);
  await page.context().close();

  return id;
}
