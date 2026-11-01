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
   * Operates Quill and runs teaching, so may upload a module's video for
   * any organisation holding it. A member of "CI Teaching Hospital".
   */
  operator: "ci_operator",
  /**
   * A `teaching_admin`: holds `manage_teaching` and not `manage_users`,
   * as a teaching admin at a partner does. The default signed-in user.
   */
  teachingAdmin: "educator",
  /** The teaching admin of the second teaching organisation. */
  secondTeachingAdmin: "educator_second",
  /**
   * A `passport_admin` at "CI Passport Hospital", holding
   * `manage_passport`. Makes every holder and assessor the passport
   * journeys use, never the operator.
   */
  passportAdmin: "ci_passport_admin",
} as const;

/** What the seed calls its places. */
export const PLACES = {
  /** The teaching organisation, where the teaching admin is staff. */
  organisation: "CI Teaching Hospital",
  /** A site inside it, where the teaching admin is staff too. */
  site: "CI Teaching Centre",
  /** Its second site. */
  annexe: "CI Teaching Annexe",
  /** The second teaching organisation, with a teaching admin of its own. */
  secondOrganisation: "CI Second Hospital",
  /** A site inside that one. */
  secondSite: "CI Second Centre",
  /** Its second site. */
  secondAnnexe: "CI Second Annexe",
  /** An organisation that runs no teaching, nobody's to move anyone to. */
  otherOrganisation: "CI Other Hospital",
  /** A site inside that one. */
  otherSite: "CI Other Centre",
  /** The organisation that runs the passport, with its passport admin. */
  passportOrganisation: "CI Passport Hospital",
  /** A site inside it, where the passport journeys' people work. */
  passportSite: "CI Passport Centre",
} as const;

/** One of the four teaching sites the seed makes. */
export interface TeachingSite {
  site: string;
  organisation: string;
  /** The username of the site's clinical lead. */
  lead: string;
  /** The username of the organisation's teaching admin. */
  admin: string;
}

/**
 * Two teaching organisations of two sites each, every site with its own
 * clinical lead, so a test can see what crosses a site or an
 * organisation and what does not.
 */
export const TEACHING_SITES = {
  centre: {
    site: PLACES.site,
    organisation: PLACES.organisation,
    lead: "ci_lead",
    admin: PEOPLE.teachingAdmin,
  },
  annexe: {
    site: PLACES.annexe,
    organisation: PLACES.organisation,
    lead: "ci_annexe_lead",
    admin: PEOPLE.teachingAdmin,
  },
  secondCentre: {
    site: PLACES.secondSite,
    organisation: PLACES.secondOrganisation,
    lead: "ci_second_lead",
    admin: PEOPLE.secondTeachingAdmin,
  },
  secondAnnexe: {
    site: PLACES.secondAnnexe,
    organisation: PLACES.secondOrganisation,
    lead: "ci_second_annexe_lead",
    admin: PEOPLE.secondTeachingAdmin,
  },
} as const satisfies Record<string, TeachingSite>;

/** What the login page says when the rate limit refuses a sign-in. */
export const TOO_MANY_SIGN_INS =
  "Too many sign-in attempts. Please wait a minute, then try again.";

/** What signing in came to, as the login page shows it. */
export type SignInOutcome = "signed in" | "too many" | "invalid credentials";

/**
 * Press Sign in on the filled login form, and wait for what the page
 * shows: the page it moves on to, the rate limit's message, or "Invalid
 * credentials". Read off the page, never the server's answer: see
 * `.claude/rules/e2e.md`.
 */
export async function submitSignIn(page: Page): Promise<SignInOutcome> {
  let outcome: SignInOutcome | null = null;

  await page.getByRole("button", { name: "Sign in" }).click();

  // A success leaves the login page by a full navigation, so the address
  // changes only once the session is set.
  await expect
    .poll(
      async () => {
        if (!new URL(page.url()).pathname.startsWith("/login")) {
          outcome = "signed in";
        } else if (await page.getByText(TOO_MANY_SIGN_INS).isVisible()) {
          outcome = "too many";
        } else if (await page.getByText("Invalid credentials").isVisible()) {
          outcome = "invalid credentials";
        }

        return outcome;
      },
      {
        timeout: 30_000,
        message: "The login page neither moved on nor said why not",
      },
    )
    .not.toBeNull();

  return outcome ?? "invalid credentials";
}

/**
 * Sign in through the login form as one of the seeded people.
 *
 * The login route is rate-limited and the browser projects sign in side
 * by side, so a refusal by the limit is waited out and tried again.
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

    const outcome = await submitSignIn(page);
    if (outcome === "signed in") {
      return;
    }

    if (outcome !== "too many") {
      throw new Error(`Signing in as ${username} was refused: ${outcome}`);
    }

    await page.waitForTimeout(2_000 * attempt);
  }

  throw new Error(`Signing in as ${username} was refused three times`);
}

/**
 * A username no earlier run or other browser project has used.
 *
 * The time alone is not enough: two copies of one test running side by
 * side, as `--repeat-each` runs them, can ask in the same millisecond.
 * So a few random digits follow it.
 */
export function freshUsername(prefix: string, project: string): string {
  const random = Math.floor(Math.random() * 1_000)
    .toString()
    .padStart(3, "0");

  return `${prefix}_${project}_${Date.now()}${random}`;
}

/**
 * Try to sign in as *username* with *password*, and check it is refused
 * as a person sees it: "Invalid credentials", and still on the login page.
 *
 * A wrong password, a username nobody has and a deactivated account all
 * get this same answer, so the reply says nothing about which accounts
 * exist. The backend's own tests make each refusal.
 */
export async function expectRefusedSignIn(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Invalid credentials")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
}
