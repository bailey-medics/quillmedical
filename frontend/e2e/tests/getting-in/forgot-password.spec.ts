/**
 * Forgot password, following OWASP: the page says "Check your inbox" to
 * everybody, and the email says what is true.
 *
 * Stories 10 to 13 of Phase 4 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. Every address
 * is new, named for the browser project and the time, so the captured
 * email found is this test's own.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { deactivate, makeAccount } from "../../fixtures/people";
import {
  emailCount,
  expectNoNewEmail,
  linkIn,
  waitForEmail,
} from "../../fixtures/mail";
import {
  registerFromTheLoginPage,
  registeringEmailOf,
} from "../../fixtures/registration";
import {
  expectRefusedSignIn,
  freshUsername,
  signIn,
} from "../../fixtures/signIn";

test.describe.configure({ timeout: 90_000 });

/** Ask for a reset from the login page, and check what the page says. */
async function askForAReset(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();

  // The same words whoever asks, so the page shows nobody's account.
  await expect(page.getByText("Check your inbox")).toBeVisible();
}

/** Follow a reset link and set a new password on it. */
async function setPasswordFrom(
  page: Page,
  link: string,
  password: string,
  heading: string,
): Promise<void> {
  await page.goto(link);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await page.getByLabel("New password").fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByTestId("submit-button").click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe("Forgot password, signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a uTD is emailed that they have no account, and how to register", async ({
    page,
  }, testInfo) => {
    const address = registeringEmailOf(
      freshUsername("no_account", testInfo.project.name),
    );

    await askForAReset(page, address);

    const email = await waitForEmail(address);
    expect(email.subject).toBe("You do not have a Quill account yet");
    await page.goto(linkIn(email, "/register"));
    await expect(
      page.getByRole("textbox", { name: "Clinical lead email address" }),
    ).toBeVisible();
  });

  test("a TD who never confirmed their address confirms it and sets a password in one email", async ({
    page,
  }, testInfo) => {
    const username = freshUsername("unconfirmed_reset", testInfo.project.name);
    const address = registeringEmailOf(username);

    await registerFromTheLoginPage(page, username, `${username}Pass123!`);
    await askForAReset(page, address);

    // The newest email is the reset, not the verification sent on
    // registering.
    const email = await waitForEmail(address);
    expect(email.subject).toBe(
      "Confirm your email and set your Quill password",
    );
    const password = `${username}Set456!`;
    await setPasswordFrom(
      page,
      linkIn(email, "confirm=1"),
      password,
      "Set your password",
    );

    // Straight in: no "email not verified", and no second email.
    await signIn(page, username, password);
    await expect(page).toHaveURL(/\/teaching/);
  });
});

test.describe("Forgot password, for an account", () => {
  const professions = [
    { who: "a TD", profession: "teaching_delegate" },
    { who: "a TA", profession: "teaching_admin" },
  ] as const;

  for (const { who, profession } of professions) {
    test(`${who} resets their password with the emailed link`, async ({
      browser,
    }, testInfo) => {
      const username = freshUsername("resetting", testInfo.project.name);
      const address = registeringEmailOf(username);
      const oldPassword = `${username}Old123!`;
      const newPassword = `${username}New456!`;

      // Made by the seeded teaching admin on the form, so the address is
      // confirmed.
      await makeAccount(browser, {
        username,
        profession,
        password: oldPassword,
        email: address,
      });

      const theirs = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const them = await theirs.newPage();
      await askForAReset(them, address);

      const email = await waitForEmail(address);
      expect(email.subject).toBe("Reset your Quill password");
      await setPasswordFrom(
        them,
        linkIn(email, "/reset-password"),
        newPassword,
        "Reset password",
      );

      await expectRefusedSignIn(them, username, oldPassword);
      await signIn(them, username, newPassword);
      await theirs.close();
    });

    test(`${who} whose account is deactivated is sent nothing`, async ({
      browser,
    }, testInfo) => {
      const username = freshUsername("closed_reset", testInfo.project.name);
      const address = registeringEmailOf(username);

      await makeAccount(browser, { username, profession, email: address });
      await deactivate(browser, username);

      // Closing an account emails them to say so. That one is expected;
      // nothing after it is.
      const notice = await waitForEmail(address);
      expect(notice.subject).toBe("Your Quill account has been closed");
      const before = emailCount(address);

      const theirs = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const them = await theirs.newPage();
      await askForAReset(them, address);
      await expectNoNewEmail(address, before);
      await theirs.close();
    });
  }
});
