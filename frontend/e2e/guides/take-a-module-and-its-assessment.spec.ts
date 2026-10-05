/**
 * Screenshots for the guide "Take a module and its assessment".
 *
 * Taken as the seeded delegate who has no attempts of their own.
 */

import { test, expect } from "@playwright/test";
import { shot } from "./shot";
import { PEOPLE, signIn } from "./signIn";

test("take a module and its assessment", async ({ page }) => {
  await signIn(page, PEOPLE.learner);
  await page.goto("/teaching");
  await expect(
    page.getByRole("heading", { level: 1, name: "Teaching modules" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View module" }).first(),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/teaching-modules");

  await page.getByRole("link", { name: "View module" }).first().click();
  await expect(
    page.getByRole("button", { name: "Start assessment" }),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/module");

  // The learning materials: a slide, then the last one.
  await page.getByRole("button", { name: "Start learning" }).click();
  await expect(page).toHaveURL(/\/teaching\/learn\/.+\/slide\/0$/);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/\/slide\/1$/);
  await expect(
    page.getByRole("heading", { name: "What this module covers" }),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/slide");

  await page.goto(page.url().replace(/\/slide\/1$/, "/slide/6"));
  const finish = page.getByRole("button", { name: "Finish", exact: true });
  await expect(finish).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/last-slide");
  await finish.click();

  // The assessment, sat to the end. This writes an attempt, which is
  // why the spec has a seeded delegate of its own.
  await page.getByRole("button", { name: "Start assessment" }).click();
  const begin = page.getByRole("button", { name: "Begin", exact: true });
  await expect(begin).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/introduction");
  await begin.click();

  const next = page.getByRole("button", { name: "Next", exact: true });
  const submit = page.getByRole("button", { name: "Submit & finish" });
  await expect(page.getByRole("button", { name: "End exam" })).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeAttached();
  await page.getByRole("radio").first().check({ force: true });
  await shot(page, "take-a-module-and-its-assessment/question");

  await page.getByRole("button", { name: "End exam" }).click();
  await expect(
    page.getByText("Are you sure you want to end this exam early?"),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/end-exam");
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // Answer whatever is asked: the result is not what is photographed.
  for (let question = 0; question < 10; question += 1) {
    await page.getByRole("radio").first().check({ force: true });
    if (await submit.isVisible()) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  await submit.click();

  const viewResults = page.getByRole("button", { name: "View results" });
  await expect(viewResults).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/finished");
});

// A result worth showing is one that passed, and a spec cannot be relied
// on to pass an exam, nor should it hold the answers. So this is the
// attempt `seed_guides.py` gives its first delegate.
test("a passed result", async ({ page }) => {
  await signIn(page, PEOPLE.passedDelegate);
  await page.goto("/teaching");
  await expect(page.getByRole("heading", { name: "My history" })).toBeVisible();
  await page.getByRole("row").nth(1).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Passed" }),
  ).toBeVisible();
  await expect(page.getByText("Download certificate")).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/result");

  await page.getByRole("link", { name: "View results by question" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Results by question" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Answer given" }),
  ).toBeVisible();
  await shot(page, "take-a-module-and-its-assessment/results-by-question");
});
