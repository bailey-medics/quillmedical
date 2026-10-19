/**
 * Every slide and every question shows what the module's files say.
 *
 * Phase 11 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * The slides are read from `learning/content.mdx` (`fixtures/learning.ts`)
 * and the questions from each `question.yaml` (`fixtures/answers.ts`), so
 * new material is checked as soon as the pin in
 * `.github/scripts/ci/fetch-e2e-teaching.sh` moves to it.
 *
 * On the way, nothing of Quill's may log an error to the console, and no
 * picture or video it serves may fail to arrive, other than a download
 * the browser cancels on leaving the slide. Requests to YouTube are
 * left out: CI's runners are sent nothing by it, as `taking-a-module.spec.ts`
 * explains, and that is not the module's fault.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import {
  MODULE_ID,
  knownQuestions,
  questionShown,
} from "../../fixtures/answers";
import { answerQuestion, startTheAssessment } from "../../fixtures/assessment";
import { expectLoaded, knownSlides } from "../../fixtures/learning";
import { makeLearner } from "../../fixtures/people";
import { freshUsername, signIn } from "../../fixtures/signIn";
import { slideList } from "../../fixtures/phone";

test.describe.configure({ timeout: 300_000 });
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Collect what goes wrong on *page* from Quill's own origin, the one the
 * page is on now: errors logged to the console, and pictures or videos
 * that fail to arrive.
 */
function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  const origin = new URL(page.url()).origin;
  const ours = (url: string): boolean =>
    url.startsWith("http") && new URL(url).origin === origin;

  page.on("console", (message) => {
    if (message.type() === "error" && ours(message.location().url)) {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    // A video still downloading when the test moves to the next slide
    // is cancelled by the browser, which is not the file failing. One
    // that does not exist answers 404, caught below.
    const cancelled = /ERR_ABORTED|cancelled|NS_BINDING_ABORTED/i.test(
      request.failure()?.errorText ?? "",
    );
    if (
      !cancelled &&
      ["image", "media"].includes(request.resourceType()) &&
      ours(request.url())
    ) {
      problems.push(`failed: ${request.url()}`);
    }
  });
  page.on("response", (response) => {
    const kind = response.request().resourceType();
    if (
      ["image", "media"].includes(kind) &&
      response.status() >= 400 &&
      ours(response.url())
    ) {
      problems.push(`${response.status()}: ${response.url()}`);
    }
  });

  return problems;
}

test("every slide shows its text, pictures and videos", async ({
  page,
  browser,
  scanPage,
}, testInfo) => {
  const username = freshUsername("content_slides", testInfo.project.name);
  await makeLearner(browser, username, "teaching_delegate");
  await signIn(page, username);
  const problems = watchForProblems(page);
  const slides = knownSlides();

  // The app splits the file into as many slides as this does: the side
  // list holds one entry for each, and "Exit lesson".
  await page.goto(`/teaching/learn/${MODULE_ID}/slide/0`);
  await expect((await slideList(page)).getByRole("button")).toHaveCount(
    slides.length + 1,
  );

  for (const [index, slide] of slides.entries()) {
    await page.goto(`/teaching/learn/${MODULE_ID}/slide/${index}`);
    const main = page.getByRole("main");

    await expect(
      main.getByRole("heading", { name: slide.title, exact: true }),
      `slide ${index}`,
    ).toBeVisible();

    const shown = (await main.innerText()).replace(/\s+/g, " ");
    for (const line of slide.lines) {
      expect(shown, `slide ${index}, "${slide.title}"`).toContain(line);
    }

    if (slide.plays) {
      await expect(
        main.getByRole("group", { name: "Media player" }),
      ).toBeVisible();
    }

    if (slide.figureAlt !== null) {
      await expectLoaded(main.getByRole("img", { name: slide.figureAlt }));
    }

    await scanPage(`slide-${index}`);
  }

  expect(problems).toEqual([]);
});

test("every question shows its text, picture and options", async ({
  page,
  browser,
}, testInfo) => {
  const username = freshUsername("content_questions", testInfo.project.name);
  await makeLearner(browser, username, "teaching_delegate");
  await signIn(page, username);
  const problems = watchForProblems(page);
  const pool = knownQuestions();
  const seen = new Set<string>();

  // An attempt draws four of the five at random, so attempts are sat
  // until each has been shown. Answered wrong: a pass emails the learner
  // and their lead, and an address may be sent only ten an hour. The
  // module allows a retry straight away. Each attempt leaves a given
  // question out one time in five, so twenty miss one practically never.
  for (
    let attempt = 1;
    seen.size < pool.length && attempt <= 20;
    attempt += 1
  ) {
    await startTheAssessment(page);

    for (let question = 1; question <= 4; question += 1) {
      await expect(
        page.getByRole("heading", { name: `Question ${question}` }),
      ).toBeVisible({ timeout: 10_000 });
      const main = page.getByRole("main");
      const known = questionShown(await main.innerText());

      if (!seen.has(known.text)) {
        for (const option of known.options) {
          await expect(
            page.getByRole("radio", { name: option, exact: true }),
          ).toBeVisible();
        }
        for (const label of known.images) {
          await expectLoaded(main.getByRole("img", { name: label }).first());
        }
        seen.add(known.text);
      }

      await answerQuestion(page, question, "wrong");
    }

    await page.getByRole("button", { name: "View results" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Not passed" }),
    ).toBeVisible({ timeout: 10_000 });
  }

  expect(seen.size, "questions shown").toBe(pool.length);
  expect(problems).toEqual([]);
});
