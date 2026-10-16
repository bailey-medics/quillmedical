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

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { createAccount, emailOf, orgUnitId, send } from "../../fixtures/api";
import { MODULE_ID, questionShown } from "../../fixtures/answers";
import { waitForEmail } from "../../fixtures/mail";
import { PLACES, freshUsername, signIn } from "../../fixtures/signIn";

/** The seeded teaching admin's saved sign-in, from `auth.setup.ts`. */
const TEACHING_ADMIN_STATE = "e2e/.auth/user.json";

/**
 * Make a learner able to take the module, as the teaching admin, at a
 * site of their own with a clinical lead of its own.
 *
 * A lead of their own, because the lead is emailed on every pass and
 * `send_email` allows ten emails an hour to one address: a shared lead,
 * hearing of both browsers' learners and any retries, would run past
 * that and the email this checks would not be sent.
 */
async function makeLearner(
  browser: Browser,
  username: string,
  profession: string,
): Promise<void> {
  const context = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });
  const page = await context.newPage();
  const organisationId = await orgUnitId(page, PLACES.organisation);

  const site = await send(page, "POST", "/org-units", {
    name: `Site of ${username}`,
    type: "site",
    parent_id: organisationId,
  });
  expect(site.status(), await site.text()).toBe(200);
  const siteId = ((await site.json()) as { id: number }).id;

  const leadId = await createAccount(page, {
    username: leadOf(username),
    name: `Lead of ${username}`,
    profession: "teaching_clinical_lead",
    orgUnitIds: [siteId],
  });
  const named = await send(page, "PUT", `/org-units/${siteId}/clinical-lead`, {
    user_id: leadId,
  });
  expect(named.status(), await named.text()).toBe(200);

  await createAccount(page, {
    username,
    name: `Learner ${username}`,
    profession,
    password: `${username}123`,
    orgUnitIds: [siteId],
    takesModule: { siteId, organisationId, moduleId: MODULE_ID },
  });
  await context.close();
}

/** The username of a learner's own clinical lead. */
function leadOf(username: string): string {
  return `${username}_lead`;
}

/**
 * Sit the assessment from the module page, answering every question
 * right or every question wrong, and arrive on the result page.
 *
 * Returns the labels chosen, in order, for results by question.
 */
async function sitTheAssessment(
  page: Page,
  answer: "right" | "wrong",
): Promise<string[]> {
  const chosen: string[] = [];

  await page.goto(`/teaching/${MODULE_ID}`);
  await page.getByRole("button", { name: "Start assessment" }).click();
  await expect(
    page.getByRole("heading", { name: "Before you begin" }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Begin" }).click();

  for (let question = 1; question <= 4; question += 1) {
    await expect(
      page.getByRole("heading", { name: `Question ${question}` }),
    ).toBeVisible({ timeout: 10_000 });

    const known = questionShown(await page.getByRole("main").innerText());
    const label = answer === "right" ? known.right : known.wrong;
    await page.getByRole("radio", { name: label, exact: true }).check();
    chosen.push(label);

    await page
      .getByRole("button", {
        name: question === 4 ? "Submit & finish" : "Next",
        exact: true,
      })
      .click();
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
async function nextSlide(page: Page, slide: number): Promise<void> {
  const url = new RegExp(`/slide/${slide}$`);
  const next = page.getByRole("button", { name: "Next", exact: true });

  await expect(async () => {
    if (!url.test(page.url())) await next.click();
    await expect(page).toHaveURL(url, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Check results by question shows each answer given, and its outcome. */
async function checkResultsByQuestion(
  page: Page,
  chosen: string[],
  outcome: "Pass" | "Fail",
): Promise<void> {
  await page.getByRole("link", { name: "View results by question" }).click();
  await expect(page).toHaveURL(/\/question-results$/);

  const rows = page.getByRole("row").filter({ hasNotText: "Answer given" });
  await expect(rows).toHaveCount(chosen.length);

  for (const label of chosen) {
    const row = rows.filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(outcome);
  }
}

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

      const sideList = page.getByRole("complementary").getByRole("button");
      await expect(sideList.last()).toHaveText("Exit lesson");
      const slideCount = (await sideList.count()) - 1;

      for (let slide = 1; slide < slideCount; slide += 1) {
        await nextSlide(page, slide);
      }

      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeHidden();
      await page
        .getByRole("complementary")
        .getByRole("button", { name: "Exit lesson" })
        .click();
      await expect(page).not.toHaveURL(/\/slide\//);
    });

    test("plays the recorded lecture", async ({ page, browserName }) => {
      await signIn(page, username);
      await page.goto(`/teaching/learn/${MODULE_ID}/slide/0`);
      await page
        .getByRole("complementary")
        .getByRole("button", { name: "Recorded lecture" })
        .click();

      // The module's one video, a YouTube lecture played in Quill's own
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
      const leads = await waitForEmail(emailOf(leadOf(username)));
      expect(leads.subject).toMatch(/^Certificate issued: /);
      expect(leads.html).toContain(`Learner ${username}`);

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

      const history = page
        .getByRole("table")
        .filter({ hasText: "Question bank" })
        .getByRole("row")
        .filter({ hasNotText: "Question bank" });
      await expect(history).toHaveCount(2);
      await expect(history.filter({ hasText: "Pass" })).toHaveCount(1);
      await expect(history.filter({ hasText: "Fail" })).toHaveCount(1);

      for (const result of ["Pass", "Fail"]) {
        await history.filter({ hasText: result }).click();
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
