/**
 * The passport and safety places are out of reach of everybody in
 * teaching.
 *
 * Phase 13 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * `seed_ci.py` makes a passport organisation and a safety organisation,
 * each with a site and a member who has something there: a passport, and
 * the clinical safety officer post. What somebody may do depends on what
 * they hold and where they belong, not on what a place is for, so the same
 * checks run against each place. Everything is done and checked on
 * screen: the ids are found by the operator on the admin lists, and the
 * API's refusals are the backend's to check.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import {
  expectNotOpened,
  idsOnScreen,
  type PlaceIds,
} from "../../fixtures/places";
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

/** The ids of *place*, found on screen by the operator, who reaches everything. */
async function idsOf(browser: Browser, place: Place): Promise<PlaceIds> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, PEOPLE.superuser);

  const ids = await idsOnScreen(
    page,
    place.organisation,
    place.site,
    place.member,
  );
  await context.close();

  return ids;
}

/**
 * Check *name* is not on the admin list at *address*, once the list has
 * shown *ours*, so its absence is not a list still loading.
 */
async function expectNotListed(
  page: Page,
  address: string,
  ours: string,
  name: string,
): Promise<void> {
  await page.goto(address);
  await expect(page.getByText(ours, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
}

for (const place of PLACES) {
  test(`a teaching admin cannot reach the ${place.feature} place`, async ({
    page,
    browser,
  }) => {
    const ids = await idsOf(browser, place);
    await signIn(page, PEOPLE.teachingAdmin);

    // Not on their lists of organisations and sites, beside their own.
    // The backend's own tests are manage_teaching_org_unit_routes_test.py's
    // `test_lists_only_the_org_units_they_belong_to` and
    // `test_cannot_open_another_org_unit`, and admin_user_route_scoping_test.py's
    // `test_cannot_read_them`.
    await expectNotListed(
      page,
      "/admin/organisations",
      TEACHING_SITES.centre.organisation,
      place.organisation,
    );
    await expectNotListed(
      page,
      "/admin/sites",
      TEACHING_SITES.centre.site,
      place.site,
    );

    // Nor by address.
    await expectNotOpened(
      page,
      `/admin/organisations/${ids.organisation}`,
      place.organisation,
    );
    await expectNotOpened(page, `/admin/sites/${ids.site}`, place.site);
    await expectNotOpened(page, `/admin/users/${ids.person}`, place.member);
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
      `/admin/users/${ids.person}`,
    ]) {
      await page.goto(address);
      await expect(page.getByText("404 - Page not found")).toBeVisible();
    }
  });
}
