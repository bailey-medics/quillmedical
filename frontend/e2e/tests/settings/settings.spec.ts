/**
 * Settings, for a teaching admin and a teaching delegate.
 *
 * Phase 6 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md,
 * stories 22 to 28. Each test makes the person it changes, so nothing it
 * switches is seen by another test, a retry or the other browser.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { read } from "../../fixtures/api";
import { TEACHING_PEOPLE, makePerson } from "../../fixtures/people";
import { signIn } from "../../fixtures/signIn";
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

      await expect
        .poll(async () => (await read<{ name: string }>(page, "/auth/me")).name)
        .toBe("Renamed Person");
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

    test("turns off Help improve Quill", async ({
      page,
      browser,
    }, testInfo) => {
      const username = await makePerson(
        browser,
        `counting_${kind}`,
        testInfo.project.name,
        profession,
      );

      await signIn(page, username);
      await page.goto("/settings");
      const toggle = page.getByRole("switch", { name: "Help improve Quill" });
      await expect(toggle).toBeChecked();

      await flip(page, "Help improve Quill");
      await expect(toggle).not.toBeChecked();

      // The choice is kept, so a reload still shows it off.
      await page.reload();
      await expect(
        page.getByRole("switch", { name: "Help improve Quill" }),
      ).not.toBeChecked();
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

      // Each change is saved to the account, so a reload shows it. The
      // switch moves at once and the save follows, so the account is
      // asked before reloading, or the reload can beat the save.
      const sentNews = async () =>
        (await read<{ marketing_emails: boolean }>(page, "/auth/me"))
          .marketing_emails;

      await flip(page, name);
      await expect(page.getByRole("switch", { name })).toBeChecked();
      await expect.poll(sentNews).toBe(true);
      await page.reload();
      await expect(page.getByRole("switch", { name })).toBeChecked();

      await flip(page, name);
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
      await expect.poll(sentNews).toBe(false);
      await page.reload();
      await expect(page.getByRole("switch", { name })).not.toBeChecked();
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
      // reads from the QR code. Its secret gives the codes.
      const link = page.getByText(/^otpauth:\/\//);
      await expect(link).toBeVisible();
      const secret = new URL(await link.innerText()).searchParams.get("secret");
      expect(secret).not.toBeNull();

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

      // Signing in again now asks for a code.
      await page.context().clearCookies();
      await signInWithCode(page, username, signInCode);
      await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });

      // The same code a second time is refused (RFC 6238 section 5.2),
      // so somebody who saw it typed cannot use it too.
      await page.context().clearCookies();
      const refused = page.waitForResponse(
        (response) =>
          response.url().includes("/api/auth/login") &&
          response.request().method() === "POST" &&
          response.request().postData()?.includes("totp_code") === true,
      );
      await signInWithCode(page, username, signInCode);
      expect((await refused).status()).toBe(400);
      await expect(page).toHaveURL(/\/login/);
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
