/**
 * Settings, for a teaching admin and a teaching delegate.
 *
 * Phase 6 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md,
 * stories 22 to 28. Each test makes the person it changes, so nothing it
 * switches is seen by another test, a retry or the other browser.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { openUntil } from "../../fixtures/screen";
import { TEACHING_PEOPLE, makePerson } from "../../fixtures/people";
import { signIn } from "../../fixtures/signIn";
import { expectQrCodeHolds } from "../../fixtures/qr";
import { totpCode } from "../../fixtures/totp";

/**
 * Click a switch by its track: Mantine's input is visually hidden, so a
 * person clicks the label beside it.
 */
async function flip(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole("switch", { name });
  await page.locator(`label[for="${await toggle.getAttribute("id")}"]`).click();
}

/** How long until the 30-second step after the one *at* falls in. */
function msUntilNextStep(at: number): number {
  return 30_000 - (at % 30_000) + 250;
}

/** Sign in with a password, then answer the two-factor question. */
async function signInWithCode(
  page: Page,
  username: string,
  code: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByRole("textbox", { name: "Password" }).fill(`${username}123`);
  await page.getByRole("button", { name: "Sign in" }).click();
  const field = page.getByLabel(/authenticator code/i);
  await expect(field).toBeVisible({ timeout: 15_000 });
  await field.fill(code);
  await field.press("Enter");
}

/** The colour scheme the page is drawn in. */
async function colourScheme(page: Page): Promise<string | null> {
  return page.locator("html").getAttribute("data-mantine-color-scheme");
}

for (const { who, kind, profession } of TEACHING_PEOPLE) {
  test.describe(`Settings, as ${who}`, () => {
    test.use({ storageState: { cookies: [], origins: [] } });
    test.describe.configure({ timeout: 90_000 });

    test("updates their account details", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `account_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      await page.goto("/settings");
      await page.getByRole("link", { name: "Manage account" }).click();
      await page
        .getByRole("textbox", { name: "Full name" })
        .fill("Renamed Person");
      await page.getByRole("button", { name: "Save" }).click();

      // Their account page shows the new name once the save has landed.
      await openUntil(page, "/settings/account", async () => {
        await expect(
          page.getByRole("textbox", { name: "Full name" }),
        ).toHaveValue("Renamed Person");
      });
    });

    test("turns dark mode on and off", async ({ page, browser }, testInfo) => {
      const username = await makePerson(
        browser,
        `dark_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      await page.goto("/settings");
      const toggle = page.getByRole("switch", { name: "Dark mode" });
      await expect(toggle).not.toBeChecked();
      expect(await colourScheme(page)).toBe("light");

      await flip(page, "Dark mode");
      await expect(toggle).toBeChecked();
      expect(await colourScheme(page)).toBe("dark");

      // Kept across a reload, as the browser remembers it.
      await page.reload();
      await expect(
        page.getByRole("switch", { name: "Dark mode" }),
      ).toBeChecked();

      await flip(page, "Dark mode");
      await expect(toggle).not.toBeChecked();
      expect(await colourScheme(page)).toBe("light");
    });

    test("turns Help improve Quill off and on again", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `counting_${kind}`,
        testInfo.project.name,
        profession,
      );
      const name = "Help improve Quill";

      // Page views sent, counted as the browser sends them.
      let sent = 0;
      page.on("request", (request) => {
        if (request.url().includes("/api/analytics/page-views")) sent += 1;
      });

      /** Open a page and say whether a page view was sent for it. */
      async function countsAPageView(): Promise<boolean> {
        const before = sent;
        await page.goto("/guides");
        await expect(
          page.getByRole("heading", { level: 1, name: "Guides" }),
        ).toBeVisible();
        // Sent as the page settles, so given a moment to be.
        await page.waitForTimeout(1_000);

        return sent > before;
      }

      await signIn(page, username);
      await page.goto("/settings");
      await expect(page.getByRole("switch", { name })).toBeChecked();

      // Off: the choice is kept, so a reload still shows it off, and no
      // page view is sent.
      await flip(page, name);
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
      await page.reload();
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
      expect(await countsAPageView()).toBe(false);

      // On again: kept as well, and page views are sent again.
      await page.goto("/settings");
      await flip(page, name);
      await expect(page.getByRole("switch", { name })).toBeChecked();
      await page.reload();
      await expect(page.getByRole("switch", { name })).toBeChecked();
      expect(await countsAPageView()).toBe(true);
    });

    test("turns news and updates on and off", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `news_${kind}`,
        testInfo.project.name,
        profession,
      );
      const name = "News and updates by email";

      await signIn(page, username);
      await page.goto("/settings");
      await expect(page.getByRole("switch", { name })).not.toBeChecked();

      // Each change is saved to the account, so opening Settings again
      // shows it. The switch moves at once and the save follows, so the
      // page is opened until the save has landed.
      await flip(page, name);
      await expect(page.getByRole("switch", { name })).toBeChecked();
      await openUntil(page, "/settings", async () => {
        await expect(page.getByRole("switch", { name })).toBeChecked();
      });

      await flip(page, name);
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
      await openUntil(page, "/settings", async () => {
        await expect(page.getByRole("switch", { name })).not.toBeChecked();
      });
    });

    test("sets up two-factor authentication and signs in with it", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `totp_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      await page.goto("/settings");
      const configure = page.getByRole("button", { name: "Configure TOTP" });
      await expect(configure).toBeDisabled();

      // Story 26: turning it on offers setting it up.
      await flip(page, "Two-factor authentication (TOTP)");
      await expect(configure).toBeEnabled();
      await configure.click();
      await expect(page).toHaveURL(/\/settings\/totp$/);

      // Story 27: the page shows the otpauth:// link an authenticator app
      // reads from the QR code. Its secret gives the codes, and the QR
      // code, named for a screen reader, holds that same link: the code
      // an app scans is the one this test signs in with.
      const link = page.getByText(/^otpauth:\/\//);
      await expect(link).toBeVisible();
      const address = await link.innerText();
      const secret = new URL(address).searchParams.get("secret");
      expect(secret).not.toBeNull();
      await expectQrCodeHolds(
        page.getByRole("img", { name: "QR code for your authenticator app" }),
        address,
      );

      const setUpWith = Date.now();
      await page
        .getByLabel("6-digit code")
        .fill(totpCode(secret ?? "", setUpWith));
      await page.getByTestId("submit-button").click();
      await expect(page.getByText("Two-factor enabled")).toBeVisible();

      // Each code is used once, so signing in waits for the next
      // 30-second step: the setup code would be refused.
      await page.waitForTimeout(msUntilNextStep(setUpWith));
      const signInCode = totpCode(secret ?? "");

      // Signing in again now asks for a code. A wrong one is refused with
      // a message, and the page stays put; the right one then gets in.
      // The wrong one is a code for no step in the window either side.
      await page.context().clearCookies();
      const now = Date.now();
      const inWindow = [-30_000, 0, 30_000].map((offset) =>
        totpCode(secret ?? "", now + offset),
      );
      const wrong = ["000000", "111111", "222222", "333333"].find(
        (candidate) => !inWindow.includes(candidate),
      );
      await signInWithCode(page, username, wrong ?? "000000");
      await expect(
        page.getByText(
          "Wrong code entered, please try entering your 6-digit authenticator code again",
        ),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
      const field = page.getByLabel(/authenticator code/i);
      await field.fill(signInCode);
      await field.press("Enter");
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

      // The same code a second time is refused (RFC 6238 section 5.2),
      // so somebody who saw it typed cannot use it too.
      // The backend's own test is totp_test.py's
      // `test_the_same_code_is_refused_the_second_time`.
      await page.context().clearCookies();
      await signInWithCode(page, username, signInCode);
      await expect(
        page.getByText(
          "Wrong code entered, please try entering your 6-digit authenticator code again",
        ),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });

    test("turns two-factor off with their password, then signs in without a code", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `totp_off_${kind}`,
        testInfo.project.name,
        profession,
      );
      const name = "Two-factor authentication (TOTP)";

      // Set up as story 27 does.
      await signIn(page, username);
      await page.goto("/settings");
      await flip(page, name);
      await page.getByRole("button", { name: "Configure TOTP" }).click();
      const link = page.getByText(/^otpauth:\/\//);
      const secret = new URL(await link.innerText()).searchParams.get("secret");
      await page.getByLabel("6-digit code").fill(totpCode(secret ?? ""));
      await page.getByTestId("submit-button").click();
      await expect(page.getByText("Two-factor enabled")).toBeVisible();

      // Settings shows it on, as the account has it.
      await page.goto("/settings");
      await expect(page.getByRole("switch", { name })).toBeChecked();

      // Turning it off asks for the password. A wrong one is refused and
      // leaves it on; the right one turns it off, and that is kept.
      await flip(page, name);
      const dialog = page.getByRole("dialog", {
        name: "Turn off two-factor authentication",
      });
      await dialog
        .getByRole("textbox", { name: "Password" })
        .fill("not-their-password");
      await dialog.getByRole("button", { name: "Turn off" }).click();
      await expect(dialog.getByText("Incorrect password")).toBeVisible();
      await dialog
        .getByRole("textbox", { name: "Password" })
        .fill(`${username}123`);
      await dialog.getByRole("button", { name: "Turn off" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
      await page.reload();
      await expect(page.getByRole("switch", { name })).not.toBeChecked();

      // Signing in again asks for the password alone.
      await page.context().clearCookies();
      await signIn(page, username);
      await expect(page.getByLabel(/authenticator code/i)).toHaveCount(0);
    });

    test("is shown no Clinician passport card", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `no_passport_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      await page.goto("/settings");
      await expect(
        page.getByRole("heading", { name: "Two-factor authentication (TOTP)" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Clinician passport" }),
      ).toHaveCount(0);
    });
  });
}
