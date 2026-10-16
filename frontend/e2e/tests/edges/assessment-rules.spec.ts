/**
 * The edges of taking a module: running out of time, leaving part way,
 * retrying, and being taken off a module.
 *
 * Stories 1, 2, 3 and 5 of Phase 9 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md; story 4,
 * remembering the last slide, was dropped at EoEETA's request. Each journey
 * makes its own learner (`fixtures/people.ts`), except running out of
 * time, whose attempt `seed_ci.py` dates past its limit: the server's
 * clock is what counts, and a test cannot move it.
 */

import { test, expect } from "../../fixtures/axe";
import { MODULE_ID } from "../../fixtures/answers";
import {
  answerQuestion,
  checkResultsByQuestion,
  sitTheAssessment,
  startTheAssessment,
} from "../../fixtures/assessment";
import {
  TEACHING_ADMIN_STATE,
  TEACHING_PEOPLE,
  makeLearner,
} from "../../fixtures/people";
import { freshUsername, signIn } from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

test("an attempt that runs out of time is marked as it stood", async ({
  page,
}, testInfo) => {
  // Seeded with the first question answered right, eleven minutes into a
  // ten-minute assessment.
  await signIn(page, `out_of_time_${testInfo.project.name}`);
  await page.goto("/teaching");

  const attempt = page
    .getByRole("table")
    .filter({ hasText: "Question bank" })
    .getByRole("row")
    .filter({ hasNotText: "Question bank" });
  await expect(attempt).toHaveCount(1);
  await expect(attempt).toContainText("Fail");
  await attempt.click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Not passed" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View results by question" }).click();

  // The one answer given is marked, and the rest went unanswered.
  const rows = page.getByRole("row").filter({ hasNotText: "Answer given" });
  await expect(rows.filter({ hasText: "Not answered" })).toHaveCount(3);
  await expect(rows.filter({ hasText: "Pass" })).toHaveCount(1);
});

for (const { who, kind, profession } of TEACHING_PEOPLE) {
  test.describe(`The edges of an assessment, as ${who}`, () => {
    test("leaving part way and coming back finds the same attempt", async ({
      page,
      browser,
    }, testInfo) => {
      const username = freshUsername(`resume_${kind}`, testInfo.project.name);
      await makeLearner(browser, username, profession);

      await signIn(page, username);
      await startTheAssessment(page);
      const chosen = [
        await answerQuestion(page, 1, "right"),
        await answerQuestion(page, 2, "right"),
      ];
      await expect(page).toHaveURL(/\/teaching\/assessment\/\d+$/);
      const address = page.url();

      // Away, then back to the module and its button again.
      await page.goto("/teaching");
      await page.goto(`/teaching/${MODULE_ID}`);
      await page.getByRole("button", { name: /assessment/i }).click();
      const begin = page.getByRole("button", { name: "Begin" });
      const third = page.getByRole("heading", { name: "Question 3" });
      await expect(begin.or(third)).toBeVisible({ timeout: 10_000 });
      if (await begin.isVisible()) await begin.click();

      // The same attempt, at the question after the last one answered.
      await expect(third).toBeVisible();
      expect(page.url()).toBe(address);
      chosen.push(await answerQuestion(page, 3, "right"));
      chosen.push(await answerQuestion(page, 4, "right"));
      await page.getByRole("button", { name: "View results" }).click();

      // The two answered before leaving were kept.
      await checkResultsByQuestion(page, chosen, "Pass");
    });

    test("trying again straight after a fail starts a new attempt", async ({
      page,
      browser,
    }, testInfo) => {
      const username = freshUsername(`retry_${kind}`, testInfo.project.name);
      await makeLearner(browser, username, profession);

      await signIn(page, username);
      await sitTheAssessment(page, "wrong");
      const failed = page.url();
      await expect(
        page.getByRole("heading", { level: 1, name: "Not passed" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Try again" }).click();
      const begin = page.getByRole("button", { name: "Begin" });
      const first = page.getByRole("heading", { name: "Question 1" });
      await expect(begin.or(first)).toBeVisible({ timeout: 10_000 });
      if (await begin.isVisible()) await begin.click();
      await expect(first).toBeVisible();

      // A new attempt, not the one just failed.
      expect(page.url()).not.toBe(failed.replace(/\/result$/, ""));
    });
  });
}

test("a TD taken off the module can no longer see or start it", async ({
  browser,
}, testInfo) => {
  const username = freshUsername("taken_off_td", testInfo.project.name);
  const siteId = await makeLearner(browser, username, "teaching_delegate");

  // Their own view, before.
  const theirs = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const them = await theirs.newPage();
  await signIn(them, username);
  await them.goto("/teaching");
  await expect(them.getByRole("link", { name: "View module" })).toHaveCount(1);

  // The teaching admin unticks the module on their page at the site.
  const admin = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });
  const adminPage = await admin.newPage();
  await adminPage.goto(`/admin/sites/${siteId}`);
  // By their full name: searching the username alone also finds their
  // lead, whose username starts with theirs.
  await (await searchRow(adminPage, `Learner ${username}`)).click();
  const module = adminPage
    .getByRole("checkbox", { name: / at CI Teaching Hospital$/ })
    .first();
  await expect(module).toBeChecked();
  await module.uncheck();
  await adminPage.getByRole("button", { name: "Save enrolment" }).click();
  await expect(adminPage.getByText("Enrolment updated")).toBeVisible();
  await admin.close();

  // Their own view, after: no module, and its address does not open it.
  await them.goto("/teaching");
  await expect(
    them.getByRole("heading", { level: 1, name: "Teaching modules" }),
  ).toBeVisible();
  await expect(them.getByRole("link", { name: "View module" })).toHaveCount(0);
  await them.goto(`/teaching/${MODULE_ID}`);
  await expect(
    them.getByRole("button", { name: "Start assessment" }),
  ).toHaveCount(0);
  await theirs.close();
});
