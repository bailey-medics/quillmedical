/**
 * Sitting the pinned module's assessment, and reading its slides.
 *
 * Shared by the journeys in `tests/taking-a-module/` and `tests/edges/`.
 * The answers come from the module's own files, through `answers.ts`.
 */

import { expect, type Page } from "@playwright/test";
import { MODULE_ID, questionShown } from "./answers";
import { atPhoneWidth } from "./phone";

/** Start the assessment from the module page, and pass its intro page. */
export async function startTheAssessment(page: Page): Promise<void> {
  await page.goto(`/teaching/${MODULE_ID}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(
    page.getByRole("heading", { name: "Before you begin" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Begin" }).click();
}

/**
 * Answer the question on screen right or wrong, and move on.
 *
 * Returns the label chosen.
 */
export async function answerQuestion(
  page: Page,
  question: number,
  answer: "right" | "wrong",
): Promise<string> {
  await expect(
    page.getByRole("heading", { name: `Question ${question}` }),
  ).toBeVisible({ timeout: 10_000 });

  const known = questionShown(await page.getByRole("main").innerText());
  const label = answer === "right" ? known.right : known.wrong;
  await page.getByRole("radio", { name: label, exact: true }).check();

  await page
    .getByRole("button", {
      name: question === 4 ? "Submit & finish" : "Next",
      exact: true,
    })
    .click();

  return label;
}

/**
 * Sit the assessment from the module page, answering every question
 * right or every question wrong, and arrive on the result page.
 *
 * Returns the labels chosen, in order, for results by question.
 */
export async function sitTheAssessment(
  page: Page,
  answer: "right" | "wrong",
): Promise<string[]> {
  const chosen: string[] = [];

  await startTheAssessment(page);

  for (let question = 1; question <= 4; question += 1) {
    chosen.push(await answerQuestion(page, question, answer));
  }

  await page.getByRole("button", { name: "View results" }).click();
  await expect(page).toHaveURL(/\/teaching\/assessment\/\d+\/result$/);

  return chosen;
}

/**
 * Press Next until the slide moves on to *slide*.
 *
 * The recorded lecture's slide embeds a YouTube player, which goes on
 * laying itself out after the slide appears and moves the Next button
 * below it. A click aimed just before that lands on nothing, so the
 * click is tried again until the address moves, never pressed twice once
 * it has.
 */
export async function nextSlide(page: Page, slide: number): Promise<void> {
  const url = new RegExp(`/slide/${slide}$`);
  const next = page.getByRole("button", { name: "Next", exact: true });

  await expect(async () => {
    if (!url.test(page.url())) await next.click();
    await expect(page).toHaveURL(url, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Check results by question shows each answer given, and its outcome. */
export async function checkResultsByQuestion(
  page: Page,
  chosen: string[],
  outcome: "Pass" | "Fail",
): Promise<void> {
  await page.getByRole("link", { name: "View results by question" }).click();
  await expect(page).toHaveURL(/\/question-results$/);

  // At a phone's width the table is a stack of cards with no table role.
  // Each answer given is shown, and the outcome badge is counted: one per
  // question, all this outcome, says what the rows say below.
  if (atPhoneWidth(page)) {
    for (const label of chosen) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(
      page.getByRole("main").getByText(outcome, { exact: true }),
    ).toHaveCount(chosen.length);

    return;
  }

  const rows = page.getByRole("row").filter({ hasNotText: "Answer given" });
  await expect(rows).toHaveCount(chosen.length);

  for (const label of chosen) {
    const row = rows.filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(outcome);
  }
}
