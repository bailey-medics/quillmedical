/**
 * What is not theirs, feedback, and signing out, for a teaching admin and
 * a teaching delegate.
 *
 * Phase 8 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * Each test makes the person it signs in as, so the feedback each sends
 * and the replies each is sent are their own.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { emailOf } from "../../fixtures/api";
import { waitForEmail } from "../../fixtures/mail";
import { TEACHING_PEOPLE, makePerson } from "../../fixtures/people";
import { PEOPLE, signIn } from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";

const NOT_FOUND = "404 - Page not found";

/** The places a teaching user must not reach, and must not be shown. */
const NOT_THEIRS = {
  links: ["Passport", "Safety"],
  addresses: ["/passport", "/passport/logbook", "/safety", "/safety/1"],
};

/** The admin pages a delegate must not reach. */
const ADMIN_ADDRESSES = ["/admin", "/admin/users", "/admin/teaching"];

/** Check an address shows the 404 page, not the page or an error. */
async function expectNotFound(page: Page, address: string): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { name: NOT_FOUND })).toBeVisible();
  await expect(page.getByTestId("error-boundary-fallback")).toHaveCount(0);
}

/** Send feedback from the menu. */
async function sendFeedback(page: Page, message: string): Promise<void> {
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "Feedback" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Send feedback" });
  await dialog.getByRole("combobox", { name: "What is it about?" }).click();
  await page.getByRole("option").first().click();
  await dialog.getByRole("textbox", { name: "Message" }).fill(message);
  await dialog.getByRole("button", { name: "Send feedback" }).click();

  // The dialog says it went, then closes when asked.
  await expect(dialog.getByText("Feedback sent")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** As the superuser, write a comment on the feedback holding *message*. */
async function replyAsSuperuser(
  browser: Browser,
  message: string,
  comment: string,
): Promise<void> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await signIn(page, PEOPLE.superuser);
  await page.goto("/admin/feedback");
  await (await searchRow(page, message)).click();
  await page.getByRole("textbox", { name: "Comment" }).fill(comment);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
  await context.close();
}

for (const { who, kind, profession } of TEACHING_PEOPLE) {
  test.describe(`Everyday, as ${who}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.describe.configure({ timeout: 120_000 });

    test("is shown neither the passport nor safety, and cannot reach them", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `not_theirs_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      const menu = page.getByRole("complementary");
      await expect(menu.getByRole("link", { name: "Settings" })).toBeVisible();
      for (const link of NOT_THEIRS.links) {
        await expect(menu.getByRole("link", { name: link })).toHaveCount(0);
      }

      for (const address of NOT_THEIRS.addresses) {
        await expectNotFound(page, address);
      }
    });

    test("sends feedback, is told of a reply, and reads it", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `feedback_${kind}`,
        testInfo.project.name,
        profession,
      );
      const message = `Feedback from ${username}`;
      const comment = `Thank you, ${username}`;

      // Story 2: sending it.
      await signIn(page, username);
      await sendFeedback(page, message);

      // Story 3: seeing it, with no reply yet.
      await page.goto("/feedback");
      await expect(page.getByText(message)).toBeVisible();

      // Story 4: a reply is shown in the inbox and emailed.
      await replyAsSuperuser(browser, message, comment);
      const email = await waitForEmail(emailOf(username));
      expect(email.subject).toBe("Your feedback has a reply");

      await page.goto("/teaching");
      await expect(
        page.getByRole("button", { name: "Inbox (1 waiting)" }),
      ).toBeVisible();

      // Opening their feedback reads the reply, and the inbox empties.
      await page.goto("/feedback");
      await expect(page.getByText(comment)).toBeVisible();
      await page.goto("/teaching");
      await expect(
        page.getByRole("button", { name: "Inbox", exact: true }),
      ).toBeVisible();
    });

    test("signs out, and back in again", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `sign_out_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      await page
        .getByRole("complementary")
        .getByRole("button", { name: "Logout" })
        .click();
      await expect(page).toHaveURL(/\/login/);

      // Signed out means signed out: a page that needs signing in sends
      // them back to the login page.
      await page.goto("/teaching");
      await expect(page).toHaveURL(/\/login/);

      await signIn(page, username);
      await expect(page).toHaveURL(/\/teaching/);
    });
  });
}

test.describe("Everyday, as a TD only", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 90_000 });

  test("is shown no admin section, and cannot reach it", async ({
    page,
    browser,
  }, testInfo) => {
    const username = await makePerson(
      browser,
      "no_admin_td",
      testInfo.project.name,
      "teaching_delegate",
    );

    await signIn(page, username);
    const menu = page.getByRole("complementary");
    await expect(menu.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Admin" })).toHaveCount(0);

    for (const address of ADMIN_ADDRESSES) {
      await expectNotFound(page, address);
    }
  });
});
