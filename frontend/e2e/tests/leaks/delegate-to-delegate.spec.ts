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
    const id = /\/assessment\/(\d+)\//.exec(result)?.[1];
    expect(id, result).toBeDefined();

    const questions = result.replace(/\/result$/, "/question-results");
    const certificate = `/api/teaching/assessments/${id}/certificate`;

    // The owner can open each.
    await owner.goto(questions);
    await expect(owner.getByRole("row")).not.toHaveCount(0);
    expect((await owner.request.get(certificate)).status()).toBe(200);
    await owner.context().close();

    const snoop = await aLearnerAt(
      browser,
      "d2d_snoop",
      testInfo.project.name,
      at,
    );

    // The result page: the API behind it refuses, and nothing of it shows.
    const refused = snoop.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/teaching/assessments/${id}`,
    );
    await snoop.goto(result);
    expect([403, 404]).toContain((await refused).status());
    await expect(
      snoop.getByRole("heading", { level: 1, name: "Passed" }),
    ).toHaveCount(0);

    // Results by question: no answer of theirs on the page.
    const refusedQuestions = snoop.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/teaching/assessments/${id}/question-results`,
    );
    await snoop.goto(questions);
    expect([403, 404]).toContain((await refusedQuestions).status());
    await expect(snoop.getByRole("row")).toHaveCount(0);

    // The certificate.
    expect([403, 404]).toContain(
      (await snoop.request.get(certificate)).status(),
    );

    await snoop.context().close();
  });
}
