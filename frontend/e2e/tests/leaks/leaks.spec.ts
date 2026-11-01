/**
 * What reaches across a site or an organisation, and what does not.
 *
 * Phase 10 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * The seed makes two teaching organisations of two sites each, every
 * site with its own clinical lead and each organisation with its own
 * teaching admin (`TEACHING_SITES`). Each test puts somebody at one site
 * and looks from the others.
 *
 * The leads are shared by every run of these tests, so an email to one
 * is picked out by the learner's name, never by being the latest.
 */

import { type Browser, type Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { expectNotOpened, idsOnScreen } from "../../fixtures/places";
import { searchRow } from "../../fixtures/tables";
import { emailOf } from "../../fixtures/userForm";
import { sitTheAssessment } from "../../fixtures/assessment";
import { waitForEmail, waitForEmailMatching } from "../../fixtures/mail";
import { asTeachingAdminOf, makeLearnerAt } from "../../fixtures/people";
import {
  TEACHING_SITES,
  freshUsername,
  signIn,
  type TeachingSite,
} from "../../fixtures/signIn";

// Three minutes: each learner is added on the form by their
// organisation's teaching admin, who signs in first, before the test
// itself starts.
test.describe.configure({ timeout: 180_000 });

/** The address `seed_ci.py` gives a seeded lead. */
function seededEmailOf(username: string): string {
  return `${username}@ci.local`;
}

/**
 * On the list at *address*, search for *ours* and see it, then search
 * for *theirs* and see nothing, so the absence is a search that worked.
 */
async function expectOursNotTheirs(
  page: Page,
  address: string,
  ours: string,
  theirs: string,
): Promise<void> {
  await page.goto(address);
  await searchRow(page, ours);
  await expect(page.getByText(ours, { exact: true }).first()).toBeVisible();

  await page.getByRole("textbox", { name: "Search" }).fill(theirs);
  await expect(page.getByText(ours, { exact: true })).toHaveCount(0);
  await expect(page.getByText(theirs, { exact: true })).toHaveCount(0);
}

/** Sign a learner in, in a context of their own, and hand back the page. */
async function asLearner(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, username);

  return page;
}

/** Make a learner at *at*, who passes, and hand back their page. */
async function aLearnerWhoPassed(
  browser: Browser,
  prefix: string,
  project: string,
  at: TeachingSite,
): Promise<{ username: string; page: Page }> {
  const username = freshUsername(prefix, project);
  await makeLearnerAt(browser, username, "teaching_delegate", at);
  const page = await asLearner(browser, username);
  await sitTheAssessment(page, "right");
  await expect(
    page.getByRole("heading", { level: 1, name: "Passed" }),
  ).toBeVisible({ timeout: 10_000 });

  return { username, page };
}

test("a pass emails the delegate's own site's lead, and no other", async ({
  browser,
}, testInfo) => {
  const at = TEACHING_SITES.annexe;
  const { username, page } = await aLearnerWhoPassed(
    browser,
    "leak_email",
    testInfo.project.name,
    at,
  );
  await page.context().close();

  /** An email about this learner's certificate. */
  const aboutThem = (email: { subject: string; html: string }): boolean =>
    email.subject.startsWith("Certificate issued: ") &&
    email.html.includes(`Learner ${username}`);

  // The delegate and their own lead are told. Waiting for both means
  // anything sent to another lead for the same pass has been sent too:
  // they go out together.
  await waitForEmail(emailOf(username));
  await waitForEmailMatching(seededEmailOf(at.lead), aboutThem);

  for (const other of Object.values(TEACHING_SITES)) {
    if (other.lead === at.lead) {
      continue;
    }

    await expect(
      waitForEmailMatching(seededEmailOf(other.lead), aboutThem, 1_000),
      `${other.lead}, at ${other.site}, was told of a pass at ${at.site}`,
    ).rejects.toThrow();
  }
});

test("a teaching admin sees only their own organisation's delegates and sites", async ({
  browser,
}, testInfo) => {
  const ours = freshUsername("leak_ours", testInfo.project.name);
  const theirs = freshUsername("leak_theirs", testInfo.project.name);
  await makeLearnerAt(
    browser,
    ours,
    "teaching_delegate",
    TEACHING_SITES.annexe,
  );
  await makeLearnerAt(
    browser,
    theirs,
    "teaching_delegate",
    TEACHING_SITES.secondCentre,
  );

  const context = await asTeachingAdminOf(browser, TEACHING_SITES.centre);
  const page = await context.newPage();

  // The users list: ours is there, theirs is not. All delegates lists
  // only delegates with results, so neither new learner is on it yet.
  // The backend's own tests are listing_test.py's
  // `test_a_teaching_admin_reaches_where_they_belong_and_beneath` and,
  // for All delegates, list_delegates_lists_everyone_test.py's
  // `test_a_member_of_another_organisation_is_not_listed`.
  await expectOursNotTheirs(page, "/admin/users", ours, theirs);

  // The filter on All delegates offers our sites and not theirs.
  await page.goto("/admin/teaching/all-delegates");
  await expect(
    page.getByRole("heading", { level: 1, name: "All delegates" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Filter delegates" }).click();
  await page
    .getByRole("dialog", { name: "Filter delegates" })
    .getByRole("combobox", { name: "Filter delegates" })
    .click();
  await expect(
    page.getByRole("option", {
      name: TEACHING_SITES.annexe.site,
      exact: true,
    }),
  ).toBeVisible();
  for (const site of [
    TEACHING_SITES.secondCentre.site,
    TEACHING_SITES.secondAnnexe.site,
  ]) {
    await expect(
      page.getByRole("option", { name: site, exact: true }),
    ).toHaveCount(0);
  }

  await context.close();
});

test("a teaching admin cannot open the other organisation, its sites or its people", async ({
  browser,
}, testInfo) => {
  const theirs = freshUsername("leak_person", testInfo.project.name);
  await makeLearnerAt(
    browser,
    theirs,
    "teaching_delegate",
    TEACHING_SITES.secondCentre,
  );

  // Their ids, as their own teaching admin finds them on screen.
  const second = await asTeachingAdminOf(browser, TEACHING_SITES.secondCentre);
  const ids = await idsOnScreen(
    await second.newPage(),
    TEACHING_SITES.secondCentre.organisation,
    TEACHING_SITES.secondCentre.site,
    theirs,
  );
  await second.close();

  const context = await asTeachingAdminOf(browser, TEACHING_SITES.centre);
  const page = await context.newPage();

  // Not on their list of organisations, beside their own.
  await page.goto("/admin/organisations");
  await expect(
    page.getByText(TEACHING_SITES.centre.organisation, { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(TEACHING_SITES.secondCentre.organisation, { exact: true }),
  ).toHaveCount(0);

  // Nor by address. The backend's own tests are
  // manage_teaching_org_unit_routes_test.py's `test_cannot_open_another_org_unit`
  // and admin_user_route_scoping_test.py's `test_cannot_read_them`.
  await expectNotOpened(
    page,
    `/admin/organisations/${ids.organisation}`,
    TEACHING_SITES.secondCentre.organisation,
  );
  await expectNotOpened(
    page,
    `/admin/sites/${ids.site}`,
    TEACHING_SITES.secondCentre.site,
  );
  await expectNotOpened(
    page,
    `/admin/users/${ids.person}`,
    `Learner ${theirs}`,
  );

  await context.close();
});

test("a delegate sees the one module, and not another organisation's results", async ({
  browser,
}, testInfo) => {
  const { page: ourPage } = await aLearnerWhoPassed(
    browser,
    "leak_result",
    testInfo.project.name,
    TEACHING_SITES.centre,
  );
  const result = new URL(ourPage.url()).pathname;
  await ourPage.context().close();

  const theirs = freshUsername("leak_snoop", testInfo.project.name);
  await makeLearnerAt(
    browser,
    theirs,
    "teaching_delegate",
    TEACHING_SITES.secondCentre,
  );
  const page = await asLearner(browser, theirs);

  // The module both organisations serve is shown once, as theirs.
  await page.goto("/teaching");
  await expect(page.getByRole("link", { name: "View module" })).toHaveCount(1);

  // Somebody else's result, at the other organisation, shows nothing.
  // The backend's own test is attempts_test.py's
  // `test_another_persons_attempt_is_refused_as_one_that_does_not_exist_is`.
  await page.goto(result);
  await expect(
    page.getByRole("heading", { level: 1, name: "Passed" }),
  ).toHaveCount(0);

  await page.context().close();
});

test("a clinical lead is offered only at their own organisation's sites", async ({
  browser,
}) => {
  // Signed out: registering is for somebody without an account.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  // One lead at each organisation, the module open at both. Registering
  // names the site the lead's address belongs to. The check is
  // rate-limited to ten a minute, shared with the registering journeys,
  // so not all four. The backend's own tests are
  // validate_clinical_lead_test.py's `test_lead_at_unlinked_site` and
  // `test_a_site_under_an_organisation_not_offering_is_left_out`.
  for (const at of [TEACHING_SITES.annexe, TEACHING_SITES.secondCentre]) {
    await page.goto("/register");
    await page.getByRole("combobox", { name: "Teaching module" }).click();
    await page.getByRole("option").first().click();
    await page
      .getByRole("textbox", { name: "Clinical lead email address" })
      .fill(seededEmailOf(at.lead));
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("heading", { name: `Joining ${at.site}` }),
      at.lead,
    ).toBeVisible();
  }

  await context.close();
});
