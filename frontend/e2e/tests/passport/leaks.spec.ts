/**
 * What must not leak between the people of the passport.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 22 to 24. A refusal is checked at the API: every holder page
 * opens the signed-in holder's own passport, so no address shows another
 * holder's record, and the API is where a leak would be.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { read, send } from "../../fixtures/api";
import {
  asPassportAdmin,
  makeAssessor,
  makeHolder,
  type Holder,
} from "../../fixtures/passport";
import { PEOPLE, signIn } from "../../fixtures/signIn";

/** A competency with no levels and no scopes. */
const REFER_PALLIATIVE = "ghnft_radiotherapy_record_refer_palliative";

/** The member of the second passport organisation, from `seed_ci.py`. */
const SECOND_MEMBER = "ci_second_passport";

/** Sign a fresh browser context in as *username*, and return its page. */
async function pageAs(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await signIn(page, username);

  return page;
}

/** Give *holder* a logbook entry and a reflection, so there is a record. */
async function recordSomething(browser: Browser, holder: Holder) {
  const page = await pageAs(browser, holder.username);
  const entry = await send(
    page,
    "POST",
    `/passport/${holder.passportId}/logbook/${REFER_PALLIATIVE}`,
    { performed_on: "2026-10-01" },
  );
  expect(entry.status(), await entry.text()).toBe(201);
  const reflection = await send(
    page,
    "POST",
    `/passport/${holder.passportId}/reflections`,
    {
      title: "A difficult airway",
      written_on: "2026-10-01",
      body: "What I would do differently.",
      anonymised_confirmed: true,
    },
  );
  expect(reflection.status(), await reflection.text()).toBe(201);

  // The control: the holder reads every address the others are refused,
  // so a refusal below is the guard working and not a mistyped path.
  for (const address of holderOnly(holder.passportId)) {
    const response = await page.request.get(address);
    expect(response.status(), address).toBe(200);
  }

  await page.context().close();
}

/** The parts of a passport only its holder reads. */
function holderOnly(passportId: string | null): string[] {
  return [
    `/api/passport/${passportId}`,
    `/api/passport/${passportId}/logbook`,
    `/api/passport/${passportId}/reflections`,
    `/api/passport/${passportId}/cpd`,
    `/api/passport/${passportId}/certificates`,
  ];
}

/** Expect each address to be refused to the page's user. */
async function expectRefused(page: Page, addresses: string[]) {
  for (const address of addresses) {
    const response = await page.request.get(address);
    expect([403, 404], address).toContain(response.status());
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
    await recordSomething(browser, theirs);

    await signIn(page, other.username);
    await expectRefused(page, [
      ...holderOnly(theirs.passportId),
      `/api/passport/${theirs.passportId}/sign-offs`,
    ]);
  });

  test("23. an assessor reaches only the sign-off they were asked about", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);
    await recordSomething(browser, holder);

    const asking = await pageAs(browser, holder.username);
    const asked = await send(
      asking,
      "POST",
      `/passport/${holder.passportId}/competencies/${REFER_PALLIATIVE}/requests`,
      { assessor_email: assessor.email, observed_on: "2026-10-01" },
    );
    expect(asked.status(), await asked.text()).toBe(201);
    const name = ((await asked.json()) as { name: string }).name;
    await asking.context().close();

    await signIn(page, assessor.username);
    const theirs = await page.request.get(
      `/api/passport/${holder.passportId}/sign-offs/${name}`,
    );
    expect(theirs.status()).toBe(200);
    await expectRefused(page, holderOnly(holder.passportId));
  });

  test("24. a passport admin sees only the members of their own places", async ({
    browser,
  }, testInfo) => {
    // The control: somebody at this passport admin's own site, whom they
    // read.
    const ours = await makeAssessor(browser, testInfo.project.name);

    // The second organisation's member, looked up as the operator: a
    // read, not setting anything up.
    const operator = await pageAs(browser, PEOPLE.superuser);
    const found = await read<{ users: { id: number; username: string }[] }>(
      operator,
      `/users?search=${SECOND_MEMBER}`,
    );
    const member = found.users.find((user) => user.username === SECOND_MEMBER);
    expect(member).toBeDefined();
    await operator.context().close();

    const admin = await asPassportAdmin(browser);
    expect((await admin.request.get(`/api/users/${ours.id}`)).status()).toBe(
      200,
    );
    const listed = await read<{ users: { username: string }[] }>(
      admin,
      "/users",
    );
    expect(listed.users.map((user) => user.username)).not.toContain(
      SECOND_MEMBER,
    );
    expect([403, 404]).toContain(
      (await admin.request.get(`/api/users/${member?.id}`)).status(),
    );
    const changed = await send(admin, "PATCH", `/users/${member?.id}`, {
      name: "Renamed by the wrong trust",
    });
    expect([403, 404]).toContain(changed.status());

    await admin.goto(`/admin/users/${member?.id}`);
    await expect(admin.getByText(SECOND_MEMBER)).toHaveCount(0);
    await admin.context().close();
  });
});
