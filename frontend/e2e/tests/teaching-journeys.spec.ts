/**
 * A learner's two journeys through a teaching module: reading the
 * learning slides to the end, and sitting the assessment to a result.
 *
 * Against the module .github/scripts/ci/fetch-e2e-teaching.sh fetches from
 * respiratory-teaching and seed_ci.py opens for the CI organisation. Its
 * content is pinned there, so the counts below only change when the pin
 * is moved.
 */

import { expect, test } from "../fixtures/axe";

const MODULE_ID = "chest-xray-interpretation-test";

test.describe("Teaching module journeys", () => {
  test.describe.configure({ timeout: 90_000 });

  test("the learning slides can be read to the end", async ({ page }) => {
    await page.goto(`/teaching/${MODULE_ID}`);
    await page.getByRole("button", { name: "Start learning" }).click();
    await expect(page).toHaveURL(/\/slide\/0$/);

    // The side list has one entry per slide, then "Exit lesson"
    const sideList = page.getByRole("complementary").getByRole("button");
    await expect(sideList.last()).toHaveText("Exit lesson");
    const slideCount = (await sideList.count()) - 1;
    expect(slideCount).toBeGreaterThan(1);

    // Exact, or "Next" also matches the "Next steps" slide in the side list
    const next = page.getByRole("button", { name: "Next", exact: true });
    for (let slide = 1; slide < slideCount; slide += 1) {
      await next.click();
      await expect(page).toHaveURL(new RegExp(`/slide/${slide}$`));
    }

    // The last slide offers Finish, which returns to the module page
    await expect(next).toBeHidden();
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/teaching/${MODULE_ID}$`));
    await expect(
      page.getByRole("button", { name: "Start assessment" }),
    ).toBeVisible();
  });

  test("the side list jumps between slides and exits", async ({ page }) => {
    await page.goto(`/teaching/learn/${MODULE_ID}/slide/0`);
    const sideList = page.getByRole("complementary");

    await sideList.getByRole("button", { name: "Summary" }).click();
    await expect(page).toHaveURL(/\/slide\/5$/);
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();

    await sideList.getByRole("button", { name: "Exit lesson" }).click();
    await expect(page).not.toHaveURL(/\/slide\//);
  });

  test("the assessment can be sat to a result", async ({ page, scanPage }) => {
    await page.goto(`/teaching/${MODULE_ID}`);
    await page.getByRole("button", { name: "Start assessment" }).click();

    // The module's intro page, from its assessment.yaml
    await expect(
      page.getByRole("heading", { name: "Before you begin" }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Begin" }).click();

    // Four questions per attempt, drawn at random from the pool, so the
    // answers are not known: pick the first option each time. That makes
    // the result pass or fail by chance, and either is a result.
    for (let question = 1; question <= 4; question += 1) {
      await expect(
        page.getByRole("heading", { name: `Question ${question}` }),
      ).toBeVisible({ timeout: 10_000 });
      if (question === 1) await scanPage("teaching-assessment-question");

      await page.getByRole("radio").first().check();
      await page
        .getByRole("button", {
          name: question === 4 ? "Submit & finish" : "Next",
          exact: true,
        })
        .click();
    }

    await page.getByRole("button", { name: "View results" }).click();
    await expect(page).toHaveURL(/\/teaching\/assessment\/\d+\/result$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^(Passed|Not passed)$/,
      }),
    ).toBeVisible({ timeout: 10_000 });

    await scanPage("teaching-assessment-result");
  });
});
