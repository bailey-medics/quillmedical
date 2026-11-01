/**
 * One delegate cannot open another's result, results by question or
 * certificate.
 *
 * Phase 12 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * The nearest case: delegates who share a site, or an organisation, and so
 * a module, a lead and a teaching admin. Every route a delegate could try
 * is checked by `backend/tests/a_delegate_reaches_only_their_own_test.py`;
 * this is what they see in a browser. Each page is first opened by its
 * owner, so a refusal is the page turning somebody away and not a page
 * that never worked.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { sitTheAssessment } from "../../fixtures/assessment";
import { makeLearnerAt } from "../../fixtures/people";
import {
  TEACHING_SITES,
  freshUsername,
  signIn,
  type TeachingSite,
} from "../../fixtures/signIn";

test.describe.configure({ timeout: 120_000 });

/** Make a learner at *at*, sign them in, and hand back their page. */
async function aLearnerAt(
  browser: Browser,
  prefix: string,
  project: string,
  at: TeachingSite,
): Promise<Page> {
  const username = freshUsername(prefix, project);
  await makeLearnerAt(browser, username, "teaching_delegate", at);
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await signIn(page, username);

  return page;
}

for (const { who, at } of [
  { who: "at the same site", at: TEACHING_SITES.centre },
  { who: "at another site of the organisation", at: TEACHING_SITES.annexe },
]) {
  test(`a delegate ${who} cannot open another's result`, async ({
    browser,
  }, testInfo) => {
    const owner = await aLearnerAt(
      browser,
      "d2d_owner",
      testInfo.project.name,
      TEACHING_SITES.centre,
    );
    await sitTheAssessment(owner, "right");
    await expect(
      owner.getByRole("heading", { level: 1, name: "Passed" }),
    ).toBeVisible({ timeout: 10_000 });
    const result = new URL(owner.url()).pathname;
    const questions = result.replace(/\/result$/, "/question-results");

    // The owner can open each: their certificate downloads, and their
    // results by question are listed.
    const downloading = owner.waitForEvent("download");
    await owner.getByRole("button", { name: "Download certificate" }).click();
    expect((await downloading).suggestedFilename()).toMatch(/\.pdf$/);
    await owner.goto(questions);
    await expect(owner.getByRole("row")).not.toHaveCount(0);
    await owner.context().close();

    const snoop = await aLearnerAt(
      browser,
      "d2d_snoop",
      testInfo.project.name,
      at,
    );

    // The result page and the results by question each say they could
    // not load, and show nothing of the owner's. The certificate has no
    // way in without the result page. The backend's own tests are
    // attempts_test.py's
    // `test_another_persons_attempt_is_refused_as_one_that_does_not_exist_is`
    // for the result, and the test of the same name in
    // teaching_certificate_and_question_results_test.py for the
    // certificate and the results by question.
    await snoop.goto(result);
    await expect(snoop.getByText("Error loading data")).toBeVisible();
    await expect(
      snoop.getByRole("heading", { level: 1, name: "Passed" }),
    ).toHaveCount(0);

    await snoop.goto(questions);
    await expect(snoop.getByText("Error loading data")).toBeVisible();
    await expect(snoop.getByRole("row")).toHaveCount(0);

    await snoop.context().close();
  });
}
