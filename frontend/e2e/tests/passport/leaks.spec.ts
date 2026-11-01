/**
 * What must not leak between the people of the passport.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 22 to 24, checked on screen as Phase 7 sets out. Every holder
 * page opens the signed-in person's own passport, so a leak would show as
 * somebody else's record on one of their pages. Each test first shows the
 * record to the person it belongs to, so its absence elsewhere is the
 * guard working and not a record that was never made.
 *
 * The API's half is in the backend tests, route by route:
 * `test_an_unrelated_user_cannot_read_any_part_of_it` and
 * `test_an_assessor_reads_the_sign_off_but_not_the_passport` in
 * router_test.py, and `TestSomebodyAtAnotherTrust` in
 * manage_passport_user_routes_test.py.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import {
  REFER_PALLIATIVE,
  addLogbookEntry,
  asPassportAdmin,
  askForSignOff,
  makeAssessor,
  makeHolder,
  openCompetency,
  pageAs,
  userIdFromTheList,
  writeReflection,
  type PassportPerson,
} from "../../fixtures/passport";
import { signIn } from "../../fixtures/signIn";

/** The member of the second passport organisation, from `seed_ci.py`. */
const SECOND_MEMBER = "ci_second_passport";

/** The pages that show a holder's own record. */
const HOLDER_PAGES = [
  "/passport",
  "/passport/logbook",
  "/passport/reflections",
  "/passport/sign-offs",
];

/** The reflection a holder writes, named for them so it is theirs alone. */
function reflectionOf(holder: PassportPerson): string {
  return `Reflection of ${holder.username}`;
}

/**
 * Give *holder* a logbook entry and a reflection, and, with
 * *assessorEmail*, a sign-off request, all on screen. The holder sees
 * each on their own pages, as the control.
 */
async function recordSomething(
  page: Page,
  holder: PassportPerson,
  assessorEmail?: string,
): Promise<void> {
  await addLogbookEntry(page);
  await writeReflection(page, reflectionOf(holder));

  if (assessorEmail !== undefined) {
    await openCompetency(page);
    await askForSignOff(page, assessorEmail);
  }

  await page.goto("/passport/reflections");
  await expect(page.getByText(reflectionOf(holder)).first()).toBeVisible();
}

/** On each page, once it has drawn, *text* appears nowhere. */
async function expectNowhere(
  page: Page,
  addresses: string[],
  text: string,
): Promise<void> {
  for (const address of addresses) {
    await page.goto(address);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(text), address).toHaveCount(0);
  }
}

test.describe("What must not leak", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("22. one holder cannot open another's passport", async ({
    page,
    browser,
  }, testInfo) => {
    const theirs = await makeHolder(browser, testInfo.project.name);
    const other = await makeHolder(browser, testInfo.project.name);

    const holderPage = await pageAs(browser, theirs.username);
    await recordSomething(holderPage, theirs);
    await holderPage.context().close();

    // The other holder's pages show their own empty record, and nothing
    // of the first holder's.
    await signIn(page, other.username);
    await expectNowhere(page, HOLDER_PAGES, reflectionOf(theirs));
    await page.goto("/passport");
    await expect(page.getByText("1 entry")).toHaveCount(0);
  });

  test("23. an assessor reaches only the sign-off they were asked about", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);

    const holderPage = await pageAs(browser, holder.username);
    await recordSomething(holderPage, holder, assessor.email);
    await holderPage.context().close();

    // The control: the request they were asked about opens.
    await signIn(page, assessor.username);
    await page.goto("/inbox");
    await page.getByText(REFER_PALLIATIVE.name).first().click();
    await expect(page).toHaveURL(/\/passport\/sign-off\//);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign off" }),
    ).toBeVisible();
    await expect(page.getByText(REFER_PALLIATIVE.name).first()).toBeVisible();

    // The rest of the holder's record is not on any page they can open.
    await expectNowhere(page, HOLDER_PAGES, reflectionOf(holder));
  });

  test("24. a passport admin sees only the members of their own places", async ({
    browser,
  }, testInfo) => {
    // The control: somebody at this passport admin's own site, whom they
    // find and open.
    const ours = await makeAssessor(browser, testInfo.project.name);

    // The second organisation's member, found as the operator finds
    // anybody: a lookup, not setting anything up.
    const member = await userIdFromTheList(browser, SECOND_MEMBER);

    const admin = await asPassportAdmin(browser);
    await admin.goto(`/admin/users/${ours.id}`);
    await expect(admin.getByText(ours.username).first()).toBeVisible();

    // Not in their list, even searched for by name.
    await admin.goto("/admin/users");
    await admin.getByRole("button", { name: "Search" }).click();
    await admin.getByPlaceholder(/Search/).fill(SECOND_MEMBER);
    await expect(admin.getByText("No users found")).toBeVisible();

    // And their page, or its edit page, shows nothing of them.
    for (const address of [
      `/admin/users/${member}`,
      `/admin/users/${member}/edit`,
    ]) {
      await admin.goto(address);
      await expect(admin.getByText("Error loading user")).toBeVisible();
      await expect(admin.getByText(SECOND_MEMBER), address).toHaveCount(0);
    }

    await admin.context().close();
  });
});
