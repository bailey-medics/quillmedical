/**
 * The people who act on a holder's passport: an assessor with a Quill
 * account, and one invited from outside by email.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 13 to 16. Each test makes its own holder and assessor through
 * the passport admin, so every request and its emails are its own. Each
 * request is asked for on the competency's page, as story 4 asks it, and
 * every result is checked where a person would see it (Phase 7).
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import {
  REFER_PALLIATIVE,
  askAsHolder,
  makeAssessor,
  makeHolder,
  pageAs,
  passportEmailOf,
  type PassportPerson,
} from "../../fixtures/passport";
import { freshUsername, signIn } from "../../fixtures/signIn";

/** Open the request about the competency from the inbox, and sign it. */
async function signFromTheInbox(page: Page): Promise<void> {
  await page.goto("/inbox");
  await page.getByText(REFER_PALLIATIVE.name).first().click();
  await expect(page).toHaveURL(/\/passport\/sign-off\//);
  await page.getByRole("combobox", { name: "What did you do?" }).click();
  await page.getByRole("option", { name: "Directly observed" }).click();
  await page
    .getByRole("checkbox", { name: "I confirm this declaration" })
    .check();
  await page.getByRole("button", { name: "Sign off competency" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
}

/** The row of the holder's landing page naming the competency. */
async function holderRowText(
  browser: Browser,
  holder: PassportPerson,
): Promise<string> {
  const page = await pageAs(browser, holder.username);

  await page.goto("/passport");
  const row = page.getByRole("row").filter({ hasText: REFER_PALLIATIVE.name });
  await expect(row).toBeVisible();
  const text = (await row.textContent()) ?? "";
  await page.context().close();

  return text;
}

test.describe("Assessing a passport", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("13. an assessor signs off a request from their inbox", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);
    await askAsHolder(browser, holder, assessor.email);

    await signIn(page, assessor.username);
    await signFromTheInbox(page);

    expect(await holderRowText(browser, holder)).toContain("Signed off");
  });

  test("14. an assessor declines a request, with a reason", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);
    await askAsHolder(browser, holder, assessor.email);

    // On the sign-off page, from the inbox, with the reason asked for.
    await signIn(page, assessor.username);
    await page.goto("/inbox");
    await page.getByText(REFER_PALLIATIVE.name).first().click();
    await page.getByRole("button", { name: "Decline request" }).click();
    const dialog = page.getByRole("dialog", { name: "Decline this request" });
    await dialog
      .getByRole("textbox", { name: /Why are you declining/ })
      .fill("Not yet ready to do this unsupervised.");
    await dialog.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(page).toHaveURL(/\/inbox$/);

    // The row reads Not asked, as decided in Phase 1, and the decline is
    // kept on the holder's Sign-offs page with the reason.
    expect(await holderRowText(browser, holder)).toContain("Not asked");
    const theirs = await pageAs(browser, holder.username);
    await theirs.goto("/passport/sign-offs");
    await expect(
      theirs.getByRole("heading", { name: "Declined" }),
    ).toBeVisible();
    await theirs.getByText(REFER_PALLIATIVE.name).first().click();
    await expect(
      theirs.getByText("Not yet ready to do this unsupervised."),
    ).toBeVisible();
    await theirs.context().close();
  });

  test("15. an external assessor joins through the invitation and signs", async ({
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const username = freshUsername("ea", testInfo.project.name);
    const email = passportEmailOf(username);
    const password = `${username}-Pass-123!`;
    await askAsHolder(browser, holder, email);

    // Nobody has this address, so the request invites them.
    const invitation = await waitForEmail(email);
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto(linkIn(invitation, "/passport/assessors/accept"));
    await page
      .getByRole("textbox", { name: "Your full name" })
      .fill("Dr External");
    await page.getByRole("combobox", { name: "Registering body" }).click();
    await page.getByRole("option").first().click();
    await page
      .getByRole("textbox", { name: "Registration number" })
      .fill("7654321");
    await page
      .getByRole("textbox", { name: "Choose a username" })
      .fill(username);
    await page
      .getByRole("textbox", { name: "Choose a password" })
      .fill(password);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, username, password);
    await signFromTheInbox(page);
    await context.close();

    expect(await holderRowText(browser, holder)).toContain("Signed off");
  });

  test("16. a holder can never sign off their own request", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);

    // On screen: naming yourself is refused before anything is sent.
    await signIn(page, holder.username);
    await page.goto(`/passport/competencies/${REFER_PALLIATIVE.id}`);
    await page.getByRole("button", { name: "Ask for a sign-off" }).click();
    await page.getByLabel(/Who should assess this/).fill(holder.email);
    await expect(
      page.getByRole("button", { name: "Request sign-off" }),
    ).toBeDisabled();

    // A request they made of somebody else reaches the assessor's inbox,
    // never theirs, and their own view of it offers no way to sign it.
    // The API's refusal is router_test.py's
    // `test_the_holder_cannot_sign_their_own`.
    await askAsHolder(browser, holder, assessor.email);
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
    await expect(page.getByText(REFER_PALLIATIVE.name)).toHaveCount(0);

    await page.goto("/passport/sign-offs");
    await page.getByText(REFER_PALLIATIVE.name).first().click();
    await expect(page).toHaveURL(/\/passport\/sign-offs\/[^/]+$/);
    await expect(
      page.getByRole("button", { name: "Sign off competency" }),
    ).toHaveCount(0);
    expect(await holderRowText(browser, holder)).toContain("Requested");
  });
});
