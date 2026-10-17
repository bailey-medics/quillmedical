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
import { emailOf, orgUnitId, read } from "../../fixtures/api";
import { MODULE_ID } from "../../fixtures/answers";
import { sitTheAssessment } from "../../fixtures/assessment";
import { waitForEmail, waitForEmailMatching } from "../../fixtures/mail";
import { asTeachingAdminOf, makeLearnerAt } from "../../fixtures/people";
import {
  TEACHING_SITES,
  freshUsername,
  signIn,
  type TeachingSite,
} from "../../fixtures/signIn";

test.describe.configure({ timeout: 120_000 });

/** The address `seed_ci.py` gives a seeded lead. */
function seededEmailOf(username: string): string {
  return `${username}@ci.local`;
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

  // The API: our delegate is listed, theirs is not.
  const delegates = await read<{ name: string; site_name: string | null }[]>(
    page,
    "/teaching/admin/delegates",
  );
  const names = delegates.map((delegate) => delegate.name);
  expect(names).toContain(`Learner ${ours}`);
  expect(names).not.toContain(`Learner ${theirs}`);
  expect(
    delegates.filter((delegate) =>
      [TEACHING_SITES.secondCentre.site, TEACHING_SITES.secondAnnexe.site].some(
        (site) => site === delegate.site_name,
      ),
    ),
  ).toEqual([]);

  // The users list: the same.
  const users = await read<{ users: { username: string }[] }>(page, "/users");
  const usernames = users.users.map((user) => user.username);
  expect(usernames).toContain(ours);
  expect(usernames).not.toContain(theirs);

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

  // Their ids, as their own teaching admin sees them.
  const second = await asTeachingAdminOf(browser, TEACHING_SITES.secondCentre);
  const secondPage = await second.newPage();
  const organisationId = await orgUnitId(
    secondPage,
    TEACHING_SITES.secondCentre.organisation,
  );
  const siteId = await orgUnitId(secondPage, TEACHING_SITES.secondCentre.site);
  const listed = await read<{ users: { id: number; username: string }[] }>(
    secondPage,
    "/users",
  );
  const personId = listed.users.find((user) => user.username === theirs)?.id;
  expect(personId, `${theirs} is on their own admin's list`).toBeDefined();
  await second.close();

  const context = await asTeachingAdminOf(browser, TEACHING_SITES.centre);
  const page = await context.newPage();

  // Not in the menu's list of organisations.
  const visible = await read<{ org_units: { name: string }[] }>(
    page,
    "/org-units",
  );
  expect(visible.org_units.map((unit) => unit.name)).not.toContain(
    TEACHING_SITES.secondCentre.organisation,
  );

  // Not by address, and the API refuses each.
  for (const [address, api, name] of [
    [
      `/admin/organisations/${organisationId}`,
      `/api/org-units/${organisationId}`,
      TEACHING_SITES.secondCentre.organisation,
    ],
    [
      `/admin/sites/${siteId}`,
      `/api/org-units/${siteId}`,
      TEACHING_SITES.secondCentre.site,
    ],
    [`/admin/users/${personId}`, `/api/users/${personId}`, `Learner ${theirs}`],
  ] as const) {
    const answered = page.waitForResponse(
      (response) => new URL(response.url()).pathname === api,
    );
    await page.goto(address);
    expect((await answered).status(), api).toBeGreaterThanOrEqual(400);
    await expect(page.getByRole("heading", { level: 1, name })).toHaveCount(0);
  }

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
  const assessmentId = /\/assessment\/(\d+)\//.exec(result)?.[1];
  expect(assessmentId, result).toBeDefined();
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

  // Somebody else's result, at the other organisation, is refused.
  const refused = await page.request.get(
    `/api/teaching/assessments/${assessmentId}`,
  );
  expect(refused.status()).toBeGreaterThanOrEqual(400);
  await page.goto(result);
  await expect(
    page.getByRole("heading", { level: 1, name: "Passed" }),
  ).toHaveCount(0);

  await page.context().close();
});

test("a clinical lead is offered only at their own organisation's sites", async ({
  page,
}) => {
  // One lead at each organisation, the module open at both. The check
  // is rate-limited to ten a minute, shared with the registering
  // journeys, so not all four.
  for (const at of [TEACHING_SITES.annexe, TEACHING_SITES.secondCentre]) {
    const checked = await page.request.post(
      "/api/teaching/public/validate-clinical-lead",
      { data: { email: seededEmailOf(at.lead), bank_id: MODULE_ID } },
    );
    expect(checked.status()).toBe(200);
    expect(await checked.json(), at.lead).toMatchObject({
      valid: true,
      site_name: at.site,
      sites: [{ site_name: at.site }],
    });
  }
});
