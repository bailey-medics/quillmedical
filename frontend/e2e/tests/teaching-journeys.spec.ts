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

/** The other features' chunks: everything but teaching's own. */
const OTHER_FEATURE_CHUNK =
  /\/assets\/(admin|passport|safety|clinical)Chunk-[^/]+\.js$/;

interface MarkedWindow {
  quillNotReloaded?: boolean;
}

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

  // Once somebody is signed in and idle, Quill fetches the code for the
  // other features they can open, so the first click into each is instant
  // (Phase 7 of docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md).
  // A failed fetch of a page's code is normally answered by reloading the
  // page, and a reload during an exam would lose the attempt. So the exam
  // is sat here with every other feature's code failing to load, as it
  // would after a deploy or on a bad connection: nothing may reload the
  // page, and no code at all may be fetched between starting the attempt
  // and seeing its result.
  //
  // One exam test, not two: a second sitting by the same seeded user at
  // the same moment collided with this one.
  test.describe("with the other features' code failing to load", () => {
    // Playwright cannot intercept a request once a service worker is
    // handling the page's fetches, and WebKit hands them over sooner than
    // Chromium does: without this the chunk loaded normally there and
    // nothing was made to fail. Quill's worker only caches logos and
    // favicons, so blocking it changes nothing this test is about.
    test.use({ serviceWorkers: "block" });

    test("the assessment can be sat to a result", async ({
      page,
      scanPage,
    }) => {
      const failed: string[] = [];
      await page.route(OTHER_FEATURE_CHUNK, (route) => {
        failed.push(route.request().url());
        return route.abort();
      });

      await page.goto(`/teaching/${MODULE_ID}`);
      await expect(
        page.getByRole("button", { name: "Start assessment" }),
      ).toBeVisible();

      // A mark any reload wipes, and a list of every code file asked for.
      // Together: was the page left alone since the mark was made?
      const codeRequested: string[] = [];
      page.on("request", (request) => {
        if (/\/assets\/[^/]+\.js$/.test(request.url())) {
          codeRequested.push(request.url());
        }
      });
      const mark = async () => {
        await page.evaluate(() => {
          (window as MarkedWindow).quillNotReloaded = true;
        });
        codeRequested.length = 0;
      };
      const notReloaded = () =>
        page.evaluate(() => (window as MarkedWindow).quillNotReloaded === true);

      // The module page is safe to reload, so the background fetch runs
      // here, and fails. The seeded user administers, so the admin code
      // is among what is fetched. The failure must not reload the page.
      await mark();
      await expect
        .poll(() => failed.length, { timeout: 30_000 })
        .toBeGreaterThan(0);
      expect(await notReloaded()).toBe(true);

      // From starting the attempt, no code may be fetched. `scanPage`
      // reloads the page itself, to scan in both colour schemes, so the
      // check is made up to each scan and the mark renewed after it.
      await mark();
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
        if (question === 1) {
          expect(codeRequested).toEqual([]);
          expect(await notReloaded()).toBe(true);
          await scanPage("teaching-assessment-question");
          await mark();
        }

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

      // The step that matters most: from the last question, through
      // submitting, to the result page, with nothing fetched on the way.
      expect(codeRequested).toEqual([]);
      expect(await notReloaded()).toBe(true);

      await scanPage("teaching-assessment-result");
    });
  });
});
