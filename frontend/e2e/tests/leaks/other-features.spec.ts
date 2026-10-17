/**
 * The passport and safety places are out of reach of everybody in
 * teaching.
 *
 * Phase 13 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * `seed_ci.py` makes a passport organisation and a safety organisation,
 * each with a site and a member who has something there: a passport, and
 * the clinical safety officer post. What somebody may do depends on what
 * they hold and where they belong, not on what a place is for, so the same
 * checks run against each place. Changing them through the API is the
 * backend's to check; this is what a teaching admin and a delegate can
 * open.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { orgUnitId, read } from "../../fixtures/api";
import { makeLearnerAt } from "../../fixtures/people";
import {
  PEOPLE,
  TEACHING_SITES,
  freshUsername,
  signIn,
} from "../../fixtures/signIn";

test.describe.configure({ timeout: 120_000 });
test.use({ storageState: { cookies: [], origins: [] } });

/** The places, as `OTHER_FEATURE_PLACES` in `seed_ci.py` seeds them. */
const PLACES = [
  {
    feature: "passport",
    organisation: "CI Passport Hospital",
    site: "CI Passport Centre",
    member: "ci_passport",
  },
  {
    feature: "safety",
    organisation: "CI Safety Hospital",
    site: "CI Safety Centre",
    member: "ci_safety",
  },
] as const;

type Place = (typeof PLACES)[number];

/** The ids of *place*, as the operator, who reaches everything, sees them. */
async function idsOf(
  browser: Browser,
  place: Place,
): Promise<{ organisation: number; site: number; member: number }> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, PEOPLE.superuser);

  const organisation = await orgUnitId(page, place.organisation);
  const site = await orgUnitId(page, place.site);
  const users = await read<{ users: { id: number; username: string }[] }>(
    page,
    "/users",
  );
  const member = users.users.find((user) => user.username === place.member);
  expect(member, `${place.member} is on the operator's list`).toBeDefined();
  await context.close();

  return { organisation, site, member: member?.id ?? 0 };
}

/**
 * Open *address* and check none of it shows: the API behind it refuses
 * with a 403 or a 404, and the name it would have shown is not a heading.
 */
async function expectNotOpened(
  page: Page,
  address: string,
  api: string,
  name: string,
): Promise<void> {
  const answered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === api,
  );
  await page.goto(address);
  expect([403, 404], api).toContain((await answered).status());
  await expect(page.getByRole("heading", { level: 1, name })).toHaveCount(0);
}

for (const place of PLACES) {
  test(`a teaching admin cannot reach the ${place.feature} place`, async ({
    page,
    browser,
  }) => {
    const ids = await idsOf(browser, place);
    await signIn(page, PEOPLE.teachingAdmin);

    // Not in their list of places, which is what the menu shows.
    const listed = await read<{ org_units: { name: string }[] }>(
      page,
      "/org-units",
    );
    const names = listed.org_units.map((unit) => unit.name);
    expect(names).not.toContain(place.organisation);
    expect(names).not.toContain(place.site);

    // Nor by address.
    await expectNotOpened(
      page,
      `/admin/organisations/${ids.organisation}`,
      `/api/org-units/${ids.organisation}`,
      place.organisation,
    );
    await expectNotOpened(
      page,
      `/admin/sites/${ids.site}`,
      `/api/org-units/${ids.site}`,
      place.site,
    );
    await expectNotOpened(
      page,
      `/admin/users/${ids.member}`,
      `/api/users/${ids.member}`,
      place.member,
    );
  });

  test(`a teaching delegate sees nothing of the ${place.feature} place`, async ({
    page,
    browser,
  }, testInfo) => {
    const ids = await idsOf(browser, place);
    const username = freshUsername(
      `other_${place.feature}`,
      testInfo.project.name,
    );
    await makeLearnerAt(
      browser,
      username,
      "teaching_delegate",
      TEACHING_SITES.centre,
    );
    await signIn(page, username);

    // No link to the feature, and its pages are the 404 page.
    await expect(
      page.getByRole("link", { name: place.feature, exact: false }),
    ).toHaveCount(0);
    await page.goto(`/${place.feature}`);
    await expect(page.getByText("404 - Page not found")).toBeVisible();

    // Nor the place's admin pages.
    for (const address of [
      `/admin/organisations/${ids.organisation}`,
      `/admin/sites/${ids.site}`,
      `/admin/users/${ids.member}`,
    ]) {
      await page.goto(address);
      await expect(page.getByText("404 - Page not found")).toBeVisible();
    }
  });
}
