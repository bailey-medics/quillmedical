/**
 * Taking the module, from the login page to a certificate, for a teaching
 * admin and a teaching delegate.
 *
 * Phase 5 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md,
 * stories 1 to 21.
 * Each journey makes its own learner through the API, signed in as the
 * seeded teaching admin, at a site of their own with a clinical lead of
 * its own, practising there and enrolled on the module. A learner made
 * fresh for each run sits only that run's attempts, so the dashboard
 * holds exactly the two this sits, and a retry starts clean.
 *
 * The answers come from the pinned module's own files
 * (`fixtures/answers.ts`), so a pass and a fail are both on purpose.
 */

import { test, expect } from "../../fixtures/axe";
import { emailOf } from "../../fixtures/api";
import { MODULE_ID } from "../../fixtures/answers";
import {
  checkResultsByQuestion,
  nextSlide,
  sitTheAssessment,
} from "../../fixtures/assessment";
import { waitForEmail, waitForEmailMatching } from "../../fixtures/mail";
import { leadOf, makeLearner } from "../../fixtures/people";
import { freshUsername, signIn } from "../../fixtures/signIn";
import { atPhoneWidth, closeSlideList, slideList } from "../../fixtures/phone";

const LEARNERS = [
  { who: "a TA", kind: "ta", profession: "teaching_admin" },
  { who: "a TD", kind: "td", profession: "teaching_delegate" },
] as const;

for (const { who, kind, profession } of LEARNERS) {
  test.describe(`Taking the module, as ${who}`, () => {
    test.describe.configure({ mode: "serial", timeout: 120_000 });
    test.use({ storageState: { cookies: [], origins: [] } });

    let username = "";

    test.beforeAll(async ({ browser }, testInfo) => {
      // A site, its lead and the learner, each made on screen: longer than
      // a hook's thirty seconds on a busy runner, and the describe's own
      // timeout does not reach a hook.
      testInfo.setTimeout(120_000);
      username = freshUsername(`learner_${kind}`, testInfo.project.name);
      await makeLearner(browser, username, profession);
    });

    test("opens How to join a course from the login page, and comes back", async ({
      page,
    }) => {
      await page.goto("/login");
      await page.getByRole("link", { name: "How to join a course" }).click();
      await expect(page).toHaveURL(/\/guides\/join-a-course$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Join a course" }),
      ).toBeVisible();

      await page
        .getByRole("main")
        .getByRole("link", { name: "sign-in page" })
        .click();
      await expect(page).toHaveURL(/\/login$/);
    });

    test("signs in, sees the one module, and opens it and its learning", async ({
      page,
    }) => {
      await signIn(page, username);
      await page.goto("/teaching");

      const modules = page.getByRole("link", { name: "View module" });
      await expect(modules).toHaveCount(1);
      await modules.click();
      await expect(page).toHaveURL(new RegExp(`/teaching/${MODULE_ID}$`));

      await page.getByRole("button", { name: "Start learning" }).click();
      await expect(page).toHaveURL(/\/slide\/0$/);
    });

    test("reads every slide, and leaves the lesson from the navigation", async ({
      page,
    }) => {
      await signIn(page, username);
      await page.goto(`/teaching/learn/${MODULE_ID}/slide/0`);

      const sideList = (await slideList(page)).getByRole("button");
      await expect(sideList.last()).toHaveText("Exit lesson");
      const slideCount = (await sideList.count()) - 1;
      await closeSlideList(page);

      for (let slide = 1; slide < slideCount; slide += 1) {
        await nextSlide(page, slide);
      }

      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeHidden();
      await (
        await slideList(page)
      )
        .getByRole("button", { name: "Exit lesson" })
        .click();
      await expect(page).not.toHaveURL(/\/slide\//);
    });

    test("plays the recorded lecture", async ({ page, browserName }) => {
      await signIn(page, username);
      await page.goto(`/teaching/learn/${MODULE_ID}/slide/0`);
      await (
        await slideList(page)
      )
        .getByRole("button", { name: "Recorded lecture" })
        .click();

      // The module's YouTube lecture, played in Quill's own
      // player. Playing means the button turns to Pause and the clock
      // moves off zero.
      const player = page.getByRole("group", { name: "Media player" });
      await player.getByRole("button", { name: "Play" }).click();
      await expect(player.getByRole("button", { name: "Pause" })).toBeVisible({
        timeout: 15_000,
      });

      // The clock moving is YouTube sending the video, which is checked
      // only in Chromium on a developer's machine. YouTube sends nothing
      // to CI's data-centre runners, so there the clock stays at zero on
      // every retry. Playwright's own build of WebKit cannot decode what
      // YouTube sends, though Safari itself plays it. Elsewhere the test
      // stops at Quill's player starting.
      if (process.env.CI || browserName === "webkit") return;

      await expect(player.locator("time").first()).not.toHaveText("00:00", {
        timeout: 20_000,
      });
    });

    test("passes, downloads the certificate, and sees results by question", async ({
      page,
    }) => {
      await signIn(page, username);
      const chosen = await sitTheAssessment(page, "right");
      await expect(
        page.getByRole("heading", { level: 1, name: "Passed" }),
      ).toBeVisible({ timeout: 10_000 });

      const downloading = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download certificate" }).click();
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);

      // The learner and their clinical lead are each sent the certificate.
      const theirs = await waitForEmail(emailOf(username));
      expect(theirs.subject).toMatch(/^Certificate: /);
      // Their own site's lead, and only theirs: the leak tests in
      // tests/leaks/ check no other lead is told. Picked out by name, so
      // a retry's pass is not mistaken for this one.
      const leads = await waitForEmailMatching(
        emailOf(leadOf(username)),
        (email) => email.html.includes(`Learner ${username}`),
      );
      expect(leads.subject).toMatch(/^Certificate issued: /);

      await checkResultsByQuestion(page, chosen, "Pass");
    });

    test("fails, sees results by question, and goes back to the dashboard", async ({
      page,
    }) => {
      await signIn(page, username);
      const chosen = await sitTheAssessment(page, "wrong");
      await expect(
        page.getByRole("heading", { level: 1, name: "Not passed" }),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByRole("button", { name: "Download certificate" }),
      ).toHaveCount(0);

      await page.getByRole("button", { name: "Back to dashboard" }).click();
      await expect(page).toHaveURL(/\/teaching$/);

      await page.goBack();
      await checkResultsByQuestion(page, chosen, "Fail");
    });

    test("finds both attempts on the dashboard, and opens each and comes back", async ({
      page,
    }) => {
      await signIn(page, username);
      await page.goto("/teaching");

      // A table at desktop width; at a phone's width a card for each
      // attempt, with no table role, each with a "Result:" line and
      // opened by tapping it. Nothing else on the page says "Pass" or
      // "Fail" on its own.
      const history = page
        .getByRole("table")
        .filter({ hasText: "Question bank" })
        .getByRole("row")
        .filter({ hasNotText: "Question bank" });
      const main = page.getByRole("main");
      const attempt = (result: string) =>
        atPhoneWidth(page)
          ? main.getByText(result, { exact: true })
          : history.filter({ hasText: result });

      await expect(
        atPhoneWidth(page) ? main.getByText("Result:") : history,
      ).toHaveCount(2);
      await expect(attempt("Pass")).toHaveCount(1);
      await expect(attempt("Fail")).toHaveCount(1);

      for (const result of ["Pass", "Fail"]) {
        await attempt(result).click();
        await expect(page).toHaveURL(/\/teaching\/assessment\/\d+\/result$/);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: result === "Pass" ? "Passed" : "Not passed",
          }),
        ).toBeVisible();

        await page.getByRole("button", { name: "Back to dashboard" }).click();
        await expect(page).toHaveURL(/\/teaching$/);
      }
    });
  });
}
