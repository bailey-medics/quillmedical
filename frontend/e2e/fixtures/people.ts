/**
 * Make a person for one test, as the seeded teaching admin does it.
 *
 * A test that changes somebody's settings, password or two-factor makes
 * its own person, so a retry and the other browser never meet the change.
 * Everybody here is made on the add-user form, and every place on the
 * sites pages, as a teaching admin does in a trust: an end-to-end test
 * never calls the API to set itself up (`.claude/rules/e2e.md`). Their
 * password is their username followed by `123`, as every seeded person's
 * is, so `signIn` needs only the username.
 */

import { expect, type Browser, type BrowserContext } from "@playwright/test";
import {
  PEOPLE,
  PLACES,
  freshUsername,
  signIn,
  type TeachingSite,
} from "./signIn";
import { searchRow } from "./tables";
import {
  choose,
  fillBasicDetails,
  nextToTheEndAndCreate,
  nextUntil,
  switchOn,
} from "./userForm";

/** The seeded teaching admin's saved sign-in, from `auth.setup.ts`. */
export const TEACHING_ADMIN_STATE = "e2e/.auth/user.json";

/** The two professions the teaching journeys are tested for. */
export const TEACHING_PEOPLE = [
  { who: "a TA", kind: "ta", profession: "teaching_admin" },
  { who: "a TD", kind: "td", profession: "teaching_delegate" },
] as const;

/** How the form names each teaching profession. */
const PROFESSION_NAMES: Record<string, string> = {
  teaching_admin: "Teaching admin",
  teaching_delegate: "Teaching delegate",
  teaching_clinical_lead: "Teaching clinical lead",
};

/** The competency a learner practises, as the form's switches name it. */
const TAKE_MODULES = "Take Teaching Modules";

/** The form's name for *profession*, failing on one this file does not know. */
function professionName(profession: string): string {
  const name = PROFESSION_NAMES[profession];

  if (name === undefined) {
    throw new Error(`No form name for the profession ${profession}`);
  }

  return name;
}

/** Where somebody is added, and whether they take the module there. */
interface Placing {
  organisation: string;
  /** A site of that organisation, or none for the organisation alone. */
  site?: string;
  /** Practising "Take Teaching Modules" at the site, and enrolled. */
  takesModule?: boolean;
  /** Defaults to the username followed by `123`. */
  password?: string;
  /** Defaults to `emailOf(username)`, at a domain that receives no mail. */
  email?: string;
}

/**
 * Add somebody on the add-user form, as the admin signed in on *context*.
 *
 * Practice and enrolment are the form's own later steps, switched on as
 * a teaching admin does for a learner.
 */
async function addOnTheForm(
  context: BrowserContext,
  username: string,
  name: string,
  profession: string,
  placing: Placing,
): Promise<void> {
  const page = await context.newPage();

  await page.goto("/admin/users/new");
  await fillBasicDetails(page, {
    username,
    name,
    profession: professionName(profession),
    password: placing.password ?? `${username}123`,
    email: placing.email,
  });
  await choose(page, /^Organisation/, placing.organisation);

  if (placing.site !== undefined) {
    await choose(page, /^Site/, `${placing.organisation} - ${placing.site}`);
  }

  if (placing.takesModule && placing.site !== undefined) {
    const practice = page.getByRole("switch", {
      name: `${TAKE_MODULES} at ${placing.site}: may practise here`,
    });
    await nextUntil(page, practice);
    await switchOn(
      page,
      `${TAKE_MODULES} at ${placing.site}: may practise here`,
    );

    const module = page
      .getByRole("checkbox", {
        name: new RegExp(` at ${placing.organisation}$`),
      })
      .first();
    await nextUntil(page, module);
    await module.check();
    await expect(module).toBeChecked();
  }

  await nextToTheEndAndCreate(page);
  await page.close();
}

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

  await addOnTheForm(context, username, `Person ${username}`, profession, {
    organisation: PLACES.organisation,
    site: PLACES.site,
  });
  await context.close();

  return username;
}

/** An account a journey needs details of its own for. */
export interface OwnAccount {
  username: string;
  /** Its id, as the profession list names it: `teaching_delegate`. */
  profession: string;
  password?: string;
  /**
   * An address that can receive mail, for a journey that is emailed:
   * forgot password refuses an address at `.test`.
   */
  email?: string;
}

/**
 * Make *account* on the add-user form, as the seeded teaching admin, at
 * the teaching organisation and its site.
 */
export async function makeAccount(
  browser: Browser,
  account: OwnAccount,
): Promise<void> {
  const context = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });

  await addOnTheForm(
    context,
    account.username,
    `Person ${account.username}`,
    account.profession,
    {
      organisation: PLACES.organisation,
      site: PLACES.site,
      password: account.password,
      email: account.email,
    },
  );
  await context.close();
}

/**
 * Close or reopen *username*'s account on their admin page, as the seeded
 * teaching admin does, and confirm it.
 */
async function setActive(
  browser: Browser,
  username: string,
  active: boolean,
): Promise<void> {
  const button = active ? "Reactivate" : "Deactivate";
  const context = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });
  const page = await context.newPage();

  await page.goto("/admin/users");
  await searchRow(page, username);
  // By their username's text, not a table row: a phone shows cards.
  await page.getByText(username, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
  await page.getByRole("button", { name: button, exact: true }).click();

  const dialog = page.getByRole("dialog").filter({
    hasText: active ? "be able to log in again" : "no longer be able to log in",
  });
  // Waited for, so the click does not land while it is still opening:
  // WebKit drops a click on a modal mid-transition.
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: `${button} user` }).click();
  await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 30_000 });
  await context.close();
}

/** Deactivate *username* on their admin page, as the teaching admin does. */
export async function deactivate(
  browser: Browser,
  username: string,
): Promise<void> {
  await setActive(browser, username, false);
}

/** Reactivate *username* on their admin page, as the teaching admin does. */
export async function reactivate(
  browser: Browser,
  username: string,
): Promise<void> {
  await setActive(browser, username, true);
}

/**
 * Add a site to the seeded teaching organisation, on the sites page, and
 * return its id, read from the address its page opens at.
 */
async function addSite(context: BrowserContext, name: string): Promise<number> {
  const page = await context.newPage();

  await page.goto("/admin/sites");
  await page.getByRole("button", { name: "Add site" }).click();
  await page.getByRole("combobox", { name: "Organisation" }).click();
  await page.getByRole("option", { name: PLACES.organisation }).click();
  await page.getByRole("textbox", { name: "Name" }).fill(name);
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Site", exact: true }).click();
  await page.getByRole("button", { name: "Create site" }).click();
  await expect(page).toHaveURL(/\/admin\/sites\/\d+$/);

  const siteId = Number(/\/admin\/sites\/(\d+)$/.exec(page.url())?.[1]);
  await page.close();

  return siteId;
}

/** Appoint *username* clinical lead of site *siteId*, on its page. */
async function appointLead(
  context: BrowserContext,
  siteId: number,
  username: string,
): Promise<void> {
  const page = await context.newPage();

  await page.goto(`/admin/sites/${siteId}`);
  await page.getByRole("button", { name: "Add staff" }).click();
  await page.getByLabel("Username or email address").fill(username);
  await page.getByRole("button", { name: "Find" }).click();
  await expect(
    page.getByText(/already has a Quill account/).first(),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Role" }).click();
  await page
    .getByRole("option", { name: "Clinical lead", exact: true })
    .click();
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/sites/${siteId}$`), {
    timeout: 30_000,
  });
  // By their username's text, not a table row: a phone shows cards.
  await searchRow(page, username);
  await expect(page.getByText(username, { exact: true }).first()).toBeVisible();
  await page.close();
}

/**
 * Make a learner able to take the module, as the teaching admin, at a
 * site of their own with a clinical lead of its own.
 *
 * A lead of their own, because a pass emails the lead of the learner's
 * site, and `send_email` allows ten emails an hour to one address: a lead
 * shared by every journey would run past that, and the email a test
 * checks would not be sent. Their password is their username followed by
 * `123`.
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
  const site = `Site of ${username}`;
  const siteId = await addSite(context, site);

  await addOnTheForm(
    context,
    leadOf(username),
    `Lead of ${username}`,
    "teaching_clinical_lead",
    { organisation: PLACES.organisation },
  );
  await appointLead(context, siteId, leadOf(username));

  await addOnTheForm(context, username, `Learner ${username}`, profession, {
    organisation: PLACES.organisation,
    site,
    takesModule: true,
  });
  await context.close();

  return siteId;
}

/**
 * Make a learner able to take the module at one of the seeded teaching
 * sites, as that organisation's teaching admin.
 *
 * Their clinical lead is the site's seeded lead, so a test can see which
 * leads a pass reaches. Shared by every test that uses the site, so only
 * the leak tests use this; a journey that checks the lead's email uses
 * `makeLearner`, whose lead is the learner's own. Their password is their
 * username followed by `123`.
 */
export async function makeLearnerAt(
  browser: Browser,
  username: string,
  profession: string,
  at: TeachingSite,
): Promise<void> {
  const context = await asTeachingAdminOf(browser, at);

  await addOnTheForm(context, username, `Learner ${username}`, profession, {
    organisation: at.organisation,
    site: at.site,
    takesModule: true,
  });
  await context.close();
}

/** A browser context signed in as the teaching admin of *at*'s organisation. */
export async function asTeachingAdminOf(
  browser: Browser,
  at: TeachingSite,
): Promise<BrowserContext> {
  if (at.admin === PEOPLE.teachingAdmin) {
    return browser.newContext({ storageState: TEACHING_ADMIN_STATE });
  }

  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  await signIn(await context.newPage(), at.admin);

  return context;
}

/** The username of a learner's own clinical lead. */
export function leadOf(username: string): string {
  return `${username}_lead`;
}
