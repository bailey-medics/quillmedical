/**
 * The edges of an account: staying signed in past the short-lived token,
 * filtering the delegates, changing a password, and the unsubscribe link.
 *
 * Stories 6, 8, 9 and 10 of Phase 9 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md; story 7, the
 * phone, is in `phone.spec.ts`. Each test makes the people it needs.
 */

import { test, expect } from "../../fixtures/axe";
import {
  createAccount,
  emailOf,
  orgUnitId,
  read,
  send,
} from "../../fixtures/api";
import { sitTheAssessment } from "../../fixtures/assessment";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import {
  TEACHING_ADMIN_STATE,
  TEACHING_PEOPLE,
  makeLearner,
  makePerson,
} from "../../fixtures/people";
import { PLACES, freshUsername, signIn } from "../../fixtures/signIn";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

for (const { who, kind, profession } of TEACHING_PEOPLE) {
  test.describe(`The edges of an account, as ${who}`, () => {
    test("carries on past the short-lived access token without signing out", async ({
      page,
      context,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `idle_${kind}`,
        testInfo.project.name,
        profession,
      );
      await signIn(page, username);
      await page.goto("/teaching");

      // The access token lasts fifteen minutes by the server's clock,
      // which a test cannot move. Its cookie is removed instead, as its
      // expiry would, leaving the refresh cookie.
      await context.clearCookies({ name: "access_token" });

      const refreshed = page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/refresh") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("complementary")
        .getByRole("link", { name: "Settings" })
        .click();

      expect((await refreshed).status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: "Settings" }),
      ).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
    });

    test("changes their password in settings", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `password_${kind}`,
        testInfo.project.name,
        profession,
      );
      const oldPassword = `${username}123`;
      const newPassword = `${username}New456!`;

      await signIn(page, username);
      await page.goto("/settings/account");
      await page.getByLabel("Current password").fill(oldPassword);
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password").fill(newPassword);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Password changed.")).toBeVisible({
        timeout: 15_000,
      });

      const old = await page.request.post("/api/auth/login", {
        data: { username, password: oldPassword },
      });
      expect(old.status()).toBe(400);
      await page.context().clearCookies();
      await signIn(page, username, newPassword);
    });

    test("turns news off from the link in an email", async ({
      page,
      browser,
    }, testInfo) => {
      const username = freshUsername(
        `unsubscribe_${kind}`,
        testInfo.project.name,
      );
      const name = "News and updates by email";

      // Made by the teaching admin, who later closes and reopens it.
      const admin = await browser.newContext({
        storageState: TEACHING_ADMIN_STATE,
      });
      const adminPage = await admin.newPage();
      const id = await createAccount(adminPage, {
        username,
        name: `Person ${username}`,
        profession,
        password: `${username}123`,
        orgUnitIds: [await orgUnitId(adminPage, PLACES.site)],
      });

      // They choose to be sent news.
      await signIn(page, username);
      await page.goto("/settings");
      const toggle = page.getByRole("switch", { name });
      await page
        .locator(`label[for="${await toggle.getAttribute("id")}"]`)
        .click();
      await expect
        .poll(
          async () =>
            (await read<{ marketing_emails: boolean }>(page, "/auth/me"))
              .marketing_emails,
        )
        .toBe(true);

      // A newsletter is sent by an operator's job the browser cannot
      // start, so the link is taken from the email that tells somebody
      // their account was closed. It is the same link every newsletter
      // carries, and it is in that email because they are sent news.
      const closed = await send(
        adminPage,
        "POST",
        `/users/${id}/deactivate`,
        {},
      );
      expect(closed.status(), await closed.text()).toBe(200);
      const notice = await waitForEmail(emailOf(username));
      expect(notice.subject).toBe("Your Quill account has been closed");

      await page.context().clearCookies();
      await page.goto(linkIn(notice, "unsubscribe"));
      await expect(
        page.getByRole("heading", { name: "Email preferences" }),
      ).toBeVisible();
      const onTheLink = page.getByRole("switch", { name });
      await expect(onTheLink).toBeChecked();
      await page
        .locator(`label[for="${await onTheLink.getAttribute("id")}"]`)
        .click();
      await expect(onTheLink).not.toBeChecked();

      // Reopened, their settings say news is off.
      const reopened = await send(
        adminPage,
        "POST",
        `/users/${id}/reactivate`,
        {},
      );
      expect(reopened.status(), await reopened.text()).toBe(200);
      await admin.close();

      await signIn(page, username);
      await page.goto("/settings");
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
    });
  });
}

test("a TA filters all delegates by site and by clinical lead", async ({
  browser,
}, testInfo) => {
  // A delegate at a site and lead of their own, who has sat the module,
  // beside the seeded `results_delegate` at "CI Teaching Centre", whose
  // lead is the seeded `ci_lead`.
  const username = freshUsername("filtered_td", testInfo.project.name);
  await makeLearner(browser, username, "teaching_delegate");
  const learner = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const learnerPage = await learner.newPage();
  await signIn(learnerPage, username);
  await sitTheAssessment(learnerPage, "right");
  await learner.close();

  const admin = await browser.newContext({
    storageState: TEACHING_ADMIN_STATE,
  });
  const page = await admin.newPage();
  const rows = page.getByRole("row");

  /**
   * Open the list afresh. It holds every delegate any journey has made,
   * paged, so the filter is what brings each one into view.
   */
  async function openTheList(): Promise<void> {
    await page.goto("/admin/teaching/all-delegates");
    await expect(
      page.getByRole("heading", { level: 1, name: "All delegates" }),
    ).toBeVisible();
  }

  /** Choose one filter: the button opens a list to pick from. */
  async function filterBy(option: string): Promise<void> {
    await page.getByRole("button", { name: "Filter delegates" }).click();
    await page
      .getByRole("dialog", { name: "Filter delegates" })
      .getByRole("combobox", { name: "Filter delegates" })
      .click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await page.keyboard.press("Escape");
  }

  // By site: only the delegate at that site.
  await openTheList();
  await filterBy(`Site of ${username}`);
  await expect(rows.filter({ hasText: username })).toHaveCount(1);
  await expect(rows.filter({ hasText: "results_delegate" })).toHaveCount(0);

  // By clinical lead: only the delegate that lead leads.
  await openTheList();
  await filterBy("ci_lead");
  await expect(rows.filter({ hasText: "results_delegate" })).toHaveCount(1);
  await expect(rows.filter({ hasText: username })).toHaveCount(0);

  await admin.close();
});
