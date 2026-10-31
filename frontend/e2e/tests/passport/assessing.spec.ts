/**
 * The people who act on a holder's passport: an assessor with a Quill
 * account, and one invited from outside by email.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 13 to 16. Each test makes its own holder and assessor through
 * the passport admin, so every request and its emails are its own.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { read, send } from "../../fixtures/api";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import {
  makeAssessor,
  makeHolder,
  passportEmailOf,
  type Holder,
} from "../../fixtures/passport";
import { freshUsername, signIn } from "../../fixtures/signIn";

/** A competency with no levels and no scopes, so a request needs little. */
const REFER_PALLIATIVE = {
  id: "ghnft_radiotherapy_record_refer_palliative",
  name: "Refer patients for palliative radiotherapy unsupervised",
};

/** One sign-off, as `GET /passport/{id}/sign-offs` lists it. */
interface SignOffListed {
  name: string;
  status: string;
  comments: string | null;
}

/** Sign a fresh browser context in as *username*, and return its page. */
async function pageAs(
  browser: Browser,
  username: string,
  password?: string,
): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await signIn(page, username, password);

  return page;
}

/**
 * As *holder*, ask *assessorEmail* to sign off the competency, through
 * the API, and return the sign-off's name. The asking is story 4's; here
 * it is only the way in.
 */
async function askThroughTheApi(
  browser: Browser,
  holder: Holder,
  assessorEmail: string,
): Promise<string> {
  const page = await pageAs(browser, holder.username);
  const asked = await send(
    page,
    "POST",
    `/passport/${holder.passportId}/competencies/${REFER_PALLIATIVE.id}/requests`,
    { assessor_email: assessorEmail, observed_on: "2026-10-01" },
  );
  expect(asked.status(), await asked.text()).toBe(201);
  const name = ((await asked.json()) as { name: string }).name;
  await page.context().close();

  return name;
}

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
  holder: Holder,
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
    await askThroughTheApi(browser, holder, assessor.email);

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
    const name = await askThroughTheApi(browser, holder, assessor.email);

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
    const listed = await read<SignOffListed[]>(
      theirs,
      `/passport/${holder.passportId}/sign-offs`,
    );
    const declined = listed.find((signOff) => signOff.name === name);
    expect(declined?.status).toBe("declined");
    await theirs.goto("/passport/sign-offs");
    await expect(
      theirs.getByRole("heading", { name: "Declined" }),
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
    await askThroughTheApi(browser, holder, email);

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

    // At the API: signing a request of their own is refused.
    const name = await askThroughTheApi(browser, holder, assessor.email);
    const forged = await send(
      page,
      "POST",
      `/passport/${holder.passportId}/sign-offs/${name}/sign-off`,
      { meaning: "directly observed", declaration_confirmed: true },
    );
    expect([403, 404]).toContain(forged.status());
    expect(await holderRowText(browser, holder)).toContain("Requested");
  });
});
