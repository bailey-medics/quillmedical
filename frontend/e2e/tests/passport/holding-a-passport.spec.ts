/**
 * The holder's own record, for a passport holder.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * stories 1 to 12, with 28 and 30 to 32 from Phase 8. Each test makes its own holder through the passport
 * admin, so nothing it records is seen by another test, a retry or the
 * other browser. Everything is done and checked on screen (Phase 7).
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { linkIn, waitForEmail } from "../../fixtures/mail";
import {
  A_DAY_LAST_MONTH,
  FRAMEWORK_NAMES,
  HOLDER_FRAMEWORKS,
  REFER_PALLIATIVE,
  addLogbookEntry,
  askForSignOff,
  fillDate,
  makeAssessor,
  makeHolder,
  openCompetency,
  openUntil,
  rowOf,
  toggleFrameworks,
  writeReflection,
} from "../../fixtures/passport";
import {
  SCAN_SHOWN,
  digestOf,
  reportScan,
  uniquePdf,
} from "../../fixtures/scanJob";
import { signIn } from "../../fixtures/signIn";
import { namesInZip } from "../../fixtures/zip";

/** Fill in the open certificate form as *what*, and record it. */
async function describeCertificate(page: Page, what: string): Promise<void> {
  await page.getByRole("textbox", { name: "What is it?" }).fill(what);
  await page
    .getByRole("textbox", { name: "Who issued it?" })
    .fill("Resuscitation Council UK");
  await fillDate(page, "Awarded on", A_DAY_LAST_MONTH);
  await page.getByRole("button", { name: "Record certificate" }).click();

  await expect(page.getByText(what).first()).toBeVisible();
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

    await toggleFrameworks(page, ["clinical"]);
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
      const name = FRAMEWORK_NAMES[id];
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

    await openUntil(page, "/passport", async () => {
      await expect(
        page.getByRole("button", { name: "Open sign-offs" }),
      ).toBeVisible({ timeout: 3_000 });
    });
    await expect(page.getByText("Records")).toBeVisible();
    await expect(page.getByTestId("competency-framework-table")).toHaveCount(0);

    await page.goto("/settings");
    await page.getByRole("radio", { name: "By competency" }).check();
    await openUntil(page, "/passport", async () => {
      await expect(
        page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
      ).toBeVisible({ timeout: 3_000 });
    });
  });

  test("7. a holder changes their frameworks in Settings", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await addLogbookEntry(page);

    // Dropped: its table goes, and nothing recorded under it is lost.
    const radiotherapy = new RegExp(FRAMEWORK_NAMES.ghnft_radiotherapy_record);
    await page.goto("/settings");
    await toggleFrameworks(page, ["ghnft_radiotherapy_record"]);

    await openUntil(page, "/passport", async () => {
      await expect(
        page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
      ).toBeVisible({ timeout: 3_000 });
      await expect(
        page.getByRole("heading", { name: radiotherapy }),
      ).toHaveCount(0, { timeout: 1_000 });
    });

    // Added back: the entry made under it is still counted.
    await page.goto("/settings");
    await toggleFrameworks(page, ["ghnft_radiotherapy_record"]);
    await openUntil(page, "/passport", async () => {
      await expect(rowOf(page, REFER_PALLIATIVE.name)).toContainText(
        "1 entry",
        { timeout: 3_000 },
      );
    });
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
    request,
  }, testInfo) => {
    // Every file waits for the malware scan. The holder is told it is
    // being checked, and it attaches once the scan job reports it clean,
    // which the test reports as the job would (fixtures/scanJob.ts).
    const holder = await makeHolder(browser, testInfo.project.name);
    const pdf = uniquePdf(holder.username);

    await signIn(page, holder.username);
    await page.goto("/passport/certificates");
    await page.getByRole("button", { name: "Record a certificate" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "als-certificate.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByText("Scanning als-certificate.pdf")).toBeVisible(
      SCAN_SHOWN,
    );
    await expect(page.getByText("Attached: als-certificate.pdf")).toHaveCount(
      0,
    );

    await reportScan(request, pdf, "clean");
    await expect(page.getByText("Attached: als-certificate.pdf")).toBeVisible(
      SCAN_SHOWN,
    );
    await page
      .getByRole("textbox", { name: "What is it?" })
      .fill("Advanced life support");
    await page
      .getByRole("textbox", { name: "Who issued it?" })
      .fill("Resuscitation Council UK");
    await fillDate(page, "Awarded on", A_DAY_LAST_MONTH);
    await page.getByRole("button", { name: "Record certificate" }).click();

    // The certificate's page shows the file: drawn page by page where
    // the browser has no PDF viewer of its own, as headless Chromium has
    // not, or in the browser's own viewer where it has. Either way the
    // stored file was loaded and drawn. That the bytes come back unchanged
    // is router_test.py's
    // `test_a_certificate_sends_its_attachment_to_show_inline`.
    await page.getByText("Advanced life support").first().click();
    await expect(
      page
        .getByRole("img", { name: "Page 1 of 1" })
        .or(page.locator('iframe[title="als-certificate.pdf"]')),
    ).toBeVisible();
    await expect(page.getByText("This file could not be shown")).toHaveCount(0);
  });

  test("30. malware is found in a certificate's file, and it is not attached", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    // The scan job reports "infected". The holder is told what was found
    // and that the file is gone, and the certificate is saved without it.
    // The backend's own tests are router_test.py's
    // `test_saving_a_record_naming_a_file_with_malware_says_why` and
    // `test_a_file_the_scan_found_malware_in_is_gone`.
    const holder = await makeHolder(browser, testInfo.project.name);
    const pdf = uniquePdf(holder.username);

    await signIn(page, holder.username);
    await page.goto("/passport/certificates");
    await page.getByRole("button", { name: "Record a certificate" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "infected.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByText("Scanning infected.pdf")).toBeVisible(
      SCAN_SHOWN,
    );

    await reportScan(request, pdf, "infected", "Eicar-Test-Signature");
    await expect(page.getByText("Malware found")).toBeVisible(SCAN_SHOWN);
    await expect(
      page.getByText(
        "Malware was found in infected.pdf (Eicar-Test-Signature). It has been deleted and is not attached.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Attached: infected.pdf")).toHaveCount(0);

    await page
      .getByRole("textbox", { name: "What is it?" })
      .fill("Basic life support");
    await page
      .getByRole("textbox", { name: "Who issued it?" })
      .fill("Resuscitation Council UK");
    await fillDate(page, "Awarded on", A_DAY_LAST_MONTH);
    await page.getByRole("button", { name: "Record certificate" }).click();

    await page.getByText("Basic life support").first().click();
    await expect(page.getByText("Resuscitation Council UK")).toBeVisible();
    await expect(page.getByText("infected.pdf")).toHaveCount(0);
    await expect(
      page.getByRole("img", { name: /^Page \d+ of \d+$/ }),
    ).toHaveCount(0);
  });

  test("31. the scan cannot check a certificate's file, and the holder is asked for it again", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    // The scan job reports "failed", as it does for a file it could not
    // read. The file is not attached, and the holder is asked to upload
    // it again. The backend's own test is router_test.py's
    // `test_saving_a_record_naming_a_file_the_scan_could_not_check_says_so`.
    const holder = await makeHolder(browser, testInfo.project.name);
    const pdf = uniquePdf(holder.username);

    await signIn(page, holder.username);
    await page.goto("/passport/certificates");
    await page.getByRole("button", { name: "Record a certificate" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "unreadable.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await expect(page.getByText("Scanning unreadable.pdf")).toBeVisible(
      SCAN_SHOWN,
    );

    await reportScan(request, pdf, "failed", "Could not read the file");
    await expect(page.getByText("Not checked")).toBeVisible(SCAN_SHOWN);
    await expect(
      page.getByText(
        "unreadable.pdf could not be checked for malware, so it is not attached. Upload it again.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Attached: unreadable.pdf")).toHaveCount(0);
  });

  test("32. the downloaded bundle leaves out a file the scan found malware in", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    // A file still being scanned after two minutes is attached anyway, so
    // a slow scan does not stop a save. The page's clock is moved on
    // rather than waited out. Here the scan then finds malware in it, and
    // the bundle the holder downloads holds only the clean file. The
    // backend's own test is router_test.py's
    // `test_the_bundle_leaves_out_a_file_not_scanned_clean`.
    const holder = await makeHolder(browser, testInfo.project.name);
    const clean = uniquePdf(`${holder.username}-clean`);
    const infected = uniquePdf(`${holder.username}-infected`);
    const input = page.locator('input[type="file"]');

    await page.clock.install();
    await signIn(page, holder.username);
    await page.goto("/passport/certificates");

    await page.getByRole("button", { name: "Record a certificate" }).click();
    await input.setInputFiles({
      name: "clean.pdf",
      mimeType: "application/pdf",
      buffer: clean,
    });
    await expect(page.getByText("Scanning clean.pdf")).toBeVisible(SCAN_SHOWN);
    await reportScan(request, clean, "clean");
    await expect(page.getByText("Attached: clean.pdf")).toBeVisible(SCAN_SHOWN);
    await describeCertificate(page, "Advanced life support");

    await page.getByRole("button", { name: "Record a certificate" }).click();
    await input.setInputFiles({
      name: "later.pdf",
      mimeType: "application/pdf",
      buffer: infected,
    });
    await expect(page.getByText("Scanning later.pdf")).toBeVisible(SCAN_SHOWN);
    await page.clock.fastForward("02:05");
    await expect(
      page.getByText(
        "Attached: later.pdf. Still scanning; it will be shown once it passes.",
      ),
    ).toBeVisible(SCAN_SHOWN);
    await describeCertificate(page, "Basic life support");
    await reportScan(request, infected, "infected", "Eicar-Test-Signature");

    await page.goto("/passport/download");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Full bundle" }).click();
    const bundle = await download;
    const names = namesInZip(await bundle.path());

    expect(names.some((name) => name.endsWith(digestOf(clean)))).toBe(true);
    expect(names.some((name) => name.endsWith(digestOf(infected)))).toBe(false);
  });

  test("28. a certificate's file is refused, and the holder is told why", async ({
    page,
    browser,
  }, testInfo) => {
    // The page refuses a type the passport does not take before sending
    // it. The backend refuses a file that is not what it claims, or a PDF
    // that runs something, and the page shows its reason. The backend's
    // own tests are router_test.py's
    // `test_bytes_that_do_not_match_the_claimed_type_are_refused` and
    // `test_a_pdf_with_active_content_is_refused`.
    const holder = await makeHolder(browser, testInfo.project.name);
    const input = page.locator('input[type="file"]');

    await signIn(page, holder.username);
    await page.goto("/passport/certificates");
    await page.getByRole("button", { name: "Record a certificate" }).click();

    const refusals: [
      { name: string; mimeType: string; buffer: Buffer },
      string,
    ][] = [
      [
        {
          name: "notes.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("Not a certificate"),
        },
        "That file cannot be attached. Use a PDF, JPEG, PNG, HEIC or WebP.",
      ],
      [
        {
          name: "certificate.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("This is plain text with a .pdf name"),
        },
        "That file is not a real PDF",
      ],
      [
        {
          name: "scripted.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(
            "%PDF-1.4\n1 0 obj<</Type/Catalog/OpenAction 2 0 R>>endobj\n" +
              "2 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj\n" +
              "trailer<</Root 1 0 R>>\n%%EOF\n",
          ),
        },
        "That PDF contains active content",
      ],
    ];

    for (const [file, reason] of refusals) {
      await input.setInputFiles(file);
      await expect(page.getByText(reason)).toBeVisible();
      await expect(page.getByText(`Attached: ${file.name}`)).toHaveCount(0);
    }
  });

  test("10. a holder writes a reflection and reads it back", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await writeReflection(page, "A difficult airway");

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
