/**
 * The holder's own record, for a passport holder.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 1 to 12. Each test makes its own holder through the passport
 * admin, so nothing it records is seen by another test, a retry or the
 * other browser.
 */

import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { read, send } from "../../fixtures/api";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import {
  FRAMEWORK_NAMES,
  HOLDER_FRAMEWORKS,
  makeAssessor,
  makeHolder,
} from "../../fixtures/passport";
import { signIn } from "../../fixtures/signIn";

/**
 * A competency in the Gloucestershire radiotherapy record with no levels
 * and no scopes, so a sign-off of it asks for nothing beyond the
 * assessor and the date.
 */
const REFER_PALLIATIVE = {
  id: "ghnft_radiotherapy_record_refer_palliative",
  name: "Refer patients for palliative radiotherapy unsupervised",
};

/** A day in the past, as the date fields are typed. */
const A_DAY_LAST_MONTH = "1 October 2026";

/** A one-page PDF, enough to be stored and opened again. */
const SMALL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
);

/** The row of the landing page's tables naming *competency*. */
function rowOf(page: Page, competency: string): Locator {
  return page.getByRole("row").filter({ hasText: competency });
}

/** Type a date into the date field labelled *label*, and leave it. */
async function fillDate(page: Page, label: string, day: string): Promise<void> {
  const field = page.getByRole("textbox", { name: label, exact: true });

  await field.fill(day);
  await field.press("Tab");
}

/** Open *competency*'s page from its row on the landing page. */
async function openCompetency(page: Page, competency: string): Promise<void> {
  await page.goto("/passport");
  await rowOf(page, competency).click();
  await expect(
    page.getByRole("heading", { level: 1, name: competency }),
  ).toBeVisible();
}

/** From a competency's page, ask *email* to sign it off. */
async function askForSignOff(page: Page, email: string): Promise<void> {
  await page.getByRole("button", { name: "Ask for a sign-off" }).click();
  await page.getByLabel(/Who should assess this/).fill(email);
  await fillDate(page, "Observed on", A_DAY_LAST_MONTH);
  await page.getByRole("button", { name: "Request sign-off" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Send request" })
    .click();
  await expect(page.getByRole("heading", { name: "Sign-offs" })).toBeVisible();
}

test.describe("Holding a passport", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("1. a holder with no passport chooses frameworks and creates one", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name, {
      passport: false,
    });

    await signIn(page, holder.username);
    await page.goto("/passport");
    await expect(
      page.getByText("You do not have a passport yet"),
    ).toBeVisible();

    // Nothing can be recorded with no framework, so none is no passport.
    const create = page.getByRole("button", { name: "Create my passport" });
    await expect(create).toBeDisabled();

    await page
      .getByRole("combobox", { name: /Frameworks you work to/ })
      .click();
    await page
      .getByRole("option", { name: new RegExp(FRAMEWORK_NAMES.clinical) })
      .click();
    await page.keyboard.press("Escape");
    await create.click();

    await expect(
      page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
    ).toBeVisible();
  });

  test("2. a passport opens By competency, a table for each framework", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await page.goto("/passport");

    for (const id of HOLDER_FRAMEWORKS) {
      const name = FRAMEWORK_NAMES[id as keyof typeof FRAMEWORK_NAMES];
      const table = page
        .getByTestId("competency-framework-table")
        .filter({ has: page.getByRole("heading", { name }) });
      await expect(table).toBeVisible();

      // A new passport: every item in the framework is there, and none
      // has been asked for.
      const rows = table
        .getByRole("row")
        .filter({ hasNot: page.getByRole("columnheader") });
      expect(await rows.count()).toBeGreaterThan(0);
      await expect(rows.filter({ hasNotText: "Not asked" })).toHaveCount(0);
    }

    // The cards for what belongs to no one competency, and none for
    // sign-offs or the logbook, which the tables stand in for.
    await expect(page.getByRole("button", { name: "Open CPD" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open sign-offs" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open logbook" }),
    ).toHaveCount(0);
  });

  test("3. a holder opens a competency from its row and adds a logbook entry there", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await openCompetency(page, REFER_PALLIATIVE.name);

    // The form is opened with the competency already chosen, so it asks
    // only about the procedure.
    await page.getByRole("button", { name: "Add an entry" }).click();
    await expect(page.getByPlaceholder("Search competencies")).toHaveCount(0);
    await fillDate(page, "Performed on", A_DAY_LAST_MONTH);
    await page.getByRole("textbox", { name: "Setting" }).fill("Day unit");
    await page.getByRole("button", { name: "Add entry" }).click();

    await expect(page.getByText("1 entry")).toBeVisible();

    await page.goto("/passport");
    await expect(rowOf(page, REFER_PALLIATIVE.name)).toContainText("1 entry");
  });

  test("4. a holder asks for a sign-off from a competency's page", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await openCompetency(page, REFER_PALLIATIVE.name);
    await askForSignOff(page, assessor.email);

    await page.goto("/passport");
    await expect(rowOf(page, REFER_PALLIATIVE.name)).toContainText("Requested");

    const email = await waitForEmail(assessor.email);
    expect(email.subject).toBe(
      `Person ${holder.username} has asked you to assess a competency`,
    );
  });

  test("5. a holder withdraws a request still waiting", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await openCompetency(page, REFER_PALLIATIVE.name);
    await askForSignOff(page, assessor.email);

    // The request, from the competency's own list of sign-offs.
    await page.getByText("Requested").first().click();
    await page.getByRole("button", { name: "Withdraw request" }).click();
    await page
      .getByRole("dialog", { name: "Withdraw this request" })
      .getByRole("button", { name: "Withdraw", exact: true })
      .click();
    await expect(page).toHaveURL(/\/passport\/sign-offs$/);

    await page.goto("/passport");
    await expect(rowOf(page, REFER_PALLIATIVE.name)).toContainText("Not asked");
  });

  test("6. a holder switches to By record in Settings, and back", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);

    await page.goto("/settings");
    await page.getByRole("radio", { name: "By record" }).check();
    await expect
      .poll(async () => {
        const me = await read<{ passport: { landing_view: string } }>(
          page,
          "/passport/me",
        );
        return me.passport.landing_view;
      })
      .toBe("by_record");

    await page.goto("/passport");
    await expect(
      page.getByRole("button", { name: "Open sign-offs" }),
    ).toBeVisible();
    await expect(page.getByText("Records")).toBeVisible();
    await expect(page.getByTestId("competency-framework-table")).toHaveCount(0);

    await page.goto("/settings");
    await page.getByRole("radio", { name: "By competency" }).check();
    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
    ).toBeVisible();
  });

  test("7. a holder changes their frameworks in Settings", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    const logged = await send(
      page,
      "POST",
      `/passport/${holder.passportId}/logbook/${REFER_PALLIATIVE.id}`,
      { performed_on: "2026-10-01" },
    );
    expect(logged.status(), await logged.text()).toBe(201);

    // Dropped: its table goes, and nothing recorded under it is lost.
    const radiotherapy = new RegExp(FRAMEWORK_NAMES.ghnft_radiotherapy_record);
    const field = page.getByRole("combobox", {
      name: /Frameworks you work to/,
    });
    await page.goto("/settings");
    await field.click();
    await page.getByRole("option", { name: radiotherapy }).click();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () => {
        const me = await read<{ passport: { frameworks: { id: string }[] } }>(
          page,
          "/passport/me",
        );
        return me.passport.frameworks.map((framework) => framework.id);
      })
      .toEqual(["clinical"]);

    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: radiotherapy })).toHaveCount(
      0,
    );

    // Added back: the entry made under it is still counted.
    await page.goto("/settings");
    await field.click();
    await page.getByRole("option", { name: radiotherapy }).click();
    await page.keyboard.press("Escape");
    await page.goto("/passport");
    await expect(rowOf(page, REFER_PALLIATIVE.name)).toContainText("1 entry");
  });

  test("8. a holder records CPD against a date range they set", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await page.goto("/settings/cpd-date-ranges");
    await page.getByRole("button", { name: "Add a date range" }).click();
    await fillDate(page, "From", "1 August 2026");
    await fillDate(page, "To", "31 July 2027");
    await page.getByRole("button", { name: "Add date range" }).click();
    await expect(page.getByRole("cell", { name: "1 Aug 2026" })).toBeVisible();

    await page.goto("/passport/cpd");
    await page.getByRole("button", { name: "Add an activity" }).click();
    await fillDate(page, "Date", A_DAY_LAST_MONTH);
    await page
      .getByRole("textbox", { name: "What was it?" })
      .fill("Regional study day");
    await page.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Teaching day" }).click();
    await page.getByLabel("Points").fill("6");
    await page.getByRole("button", { name: "Record activity" }).click();

    await expect(page.getByText("Regional study day")).toBeVisible();
    await expect(page.getByText("6 points").first()).toBeVisible();
  });

  test("9. a holder adds a certificate with its file and opens the file again", async ({
    page,
    browser,
  }, testInfo) => {
    // `UPLOAD_SCAN_JOB` is unset in the end-to-end stack, so nothing is
    // scanned and a stored file is served at once.
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await page.goto("/passport/certificates");
    await page.getByRole("button", { name: "Record a certificate" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "als-certificate.pdf",
      mimeType: "application/pdf",
      buffer: SMALL_PDF,
    });
    await expect(page.getByText("als-certificate.pdf").first()).toBeVisible();
    await page
      .getByRole("textbox", { name: "What is it?" })
      .fill("Advanced life support");
    await page
      .getByRole("textbox", { name: "Who issued it?" })
      .fill("Resuscitation Council UK");
    await fillDate(page, "Awarded on", A_DAY_LAST_MONTH);
    await page.getByRole("button", { name: "Record certificate" }).click();

    await page.getByText("Advanced life support").first().click();
    await expect(page.getByText("als-certificate.pdf").first()).toBeVisible();

    // The file comes back as the same bytes it went in as.
    const listed = await read<
      { name: string; attachments: { hash: string }[] }[]
    >(page, `/passport/${holder.passportId}/certificates`);
    const [certificate] = listed;
    const file = await page.request.get(
      `/api/passport/${holder.passportId}/certificates/${certificate.name}` +
        `/attachments/${encodeURIComponent(certificate.attachments[0].hash)}`,
    );
    expect(file.status()).toBe(200);
    expect(Buffer.from(await file.body()).equals(SMALL_PDF)).toBe(true);
  });

  test("10. a holder writes a reflection and reads it back", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await page.goto("/passport/reflections");
    await page.getByRole("button", { name: "Write a reflection" }).click();
    await page
      .getByRole("textbox", { name: "Title" })
      .fill("A difficult airway");
    await fillDate(page, "Written on", A_DAY_LAST_MONTH);
    await page
      .getByRole("textbox", { name: "Your reflection" })
      .fill("What I would do differently next time.");
    await page
      .getByRole("checkbox", {
        name: "I confirm this reflection is anonymised",
      })
      .check();
    await page.getByRole("button", { name: "Save reflection" }).click();

    await page.getByText("A difficult airway").first().click();
    await expect(
      page.getByText("What I would do differently next time."),
    ).toBeVisible();
  });

  test("11. a holder downloads their passport as Markdown, PDF and a zip", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await page.goto("/passport/download");

    for (const [label, extension] of [
      ["Markdown", ".md"],
      ["PDF", ".pdf"],
      ["Full bundle", ".zip"],
    ] as const) {
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: label }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(new RegExp(`\\${extension}$`));
      expect((await file.path()) ?? "").not.toBe("");
    }
  });

  test("12. a holder asks a supervisor to confirm a logbook entry", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const supervisor = await makeAssessor(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await openCompetency(page, REFER_PALLIATIVE.name);
    await page.getByRole("button", { name: "Add an entry" }).click();
    await fillDate(page, "Performed on", A_DAY_LAST_MONTH);
    await page
      .getByRole("textbox", { name: "Ask a supervisor to confirm this entry" })
      .fill(supervisor.email);
    await page.getByRole("button", { name: "Add entry" }).click();
    await expect(page.getByText("1 entry")).toBeVisible();

    // The supervisor follows the link in the email to their inbox, in a
    // browser of their own, and opens the request from there.
    const email = await waitForEmail(supervisor.email);
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const theirs = await context.newPage();
    await signIn(theirs, supervisor.username);
    expect(linkIn(email, "/inbox")).toMatch(/\/inbox$/);
    await theirs.goto("/inbox");
    await theirs.getByText(REFER_PALLIATIVE.name).first().click();
    await expect(theirs).toHaveURL(/\/passport\/logbook-confirmation\//);
    await theirs
      .getByRole("checkbox", { name: "This happened as recorded here" })
      .check();
    await theirs.getByRole("button", { name: "Confirm entry" }).click();
    await expect(
      theirs.getByRole("button", { name: "Confirm entry" }),
    ).toHaveCount(0);
    await context.close();

    await openCompetency(page, REFER_PALLIATIVE.name);
    await expect(page.getByText(`Person ${supervisor.username}`)).toBeVisible();
  });
});
