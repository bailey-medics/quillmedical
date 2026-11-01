/**
 * Drawing a PDF page by page, behind the production content security
 * policy.
 *
 * A phone or tablet cannot show a PDF in a frame, so `Document` draws
 * the pages itself with pdf.js. pdf.js starts a worker, loads fonts and
 * fetches decoders, and each of those is something a content security
 * policy can refuse. The unit tests replace pdf.js and Storybook has no
 * policy, so neither can tell. This stack serves the built app through
 * caddy/prod/Caddyfile, which is where the policy is set, and that makes
 * this the one place the two meet before production.
 *
 * The page is a passport certificate, where the fault was first seen.
 * Each test makes a holder on screen, records the certificate with the
 * PDF attached, and reports the file clean as the malware scan job would
 * (`fixtures/scanJob.ts`), so everything is real: the app, its worker,
 * its policy, the passport and the PDF bytes.
 */

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { A_DAY_LAST_MONTH, fillDate, makeHolder } from "../fixtures/passport";
import { SCAN_SHOWN, reportScan, taggedPdf } from "../fixtures/scanJob";
import { signIn } from "../fixtures/signIn";

const here = path.dirname(fileURLToPath(import.meta.url));

const THREE_PAGES = path.join(
  here,
  "../../public/mock-documents/6_three_page_letter.pdf",
);
const EMBEDDED_FONT = path.join(here, "../fixtures/embedded-font-letter.pdf");

/** The name the PDF is uploaded under, and shown by. */
const FILE_NAME = "Example letter.pdf";

/** The certificate it is attached to. */
const CERTIFICATE = "Example certificate";

interface PolicyWindow {
  policyRefusals: string[];
}

/** What each test makes its holder with. */
interface Holding {
  page: Page;
  browser: Browser;
  request: APIRequestContext;
  project: string;
}

/**
 * Open the certificate page as a new holder, whose one certificate has
 * the PDF at `pdfPath` attached. The browser is made to report no PDF
 * viewer, as Chrome on Android does, so the pages are drawn with pdf.js
 * in every engine these tests run in.
 */
async function openCertificate(
  { page, browser, request, project }: Holding,
  pdfPath: string,
): Promise<void> {
  await page.addInitScript(() => {
    const refusals: string[] = [];
    (window as unknown as PolicyWindow).policyRefusals = refusals;
    document.addEventListener("securitypolicyviolation", (event) => {
      refusals.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    Object.defineProperty(navigator, "pdfViewerEnabled", {
      configurable: true,
      get: () => false,
    });
  });

  const holder = await makeHolder(browser, project);
  // Bytes of this holder's own, so the scan report finds their file.
  const pdf = taggedPdf(pdfPath, holder.username);

  await signIn(page, holder.username);
  await page.goto("/passport/certificates");
  await page.getByRole("button", { name: "Record a certificate" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: FILE_NAME,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await expect(page.getByText(`Scanning ${FILE_NAME}`)).toBeVisible(SCAN_SHOWN);
  await reportScan(request, pdf, "clean");
  await expect(page.getByText(`Attached: ${FILE_NAME}`)).toBeVisible(
    SCAN_SHOWN,
  );

  await page.getByRole("textbox", { name: "What is it?" }).fill(CERTIFICATE);
  await page
    .getByRole("textbox", { name: "Who issued it?" })
    .fill("Example College");
  await fillDate(page, "Awarded on", A_DAY_LAST_MONTH);
  await page.getByRole("button", { name: "Record certificate" }).click();

  await page.getByText(CERTIFICATE).first().click();
  await expect(page).toHaveURL(/\/passport\/certificates\/[^/]+$/);
}

/** How many dark pixels a drawn page holds. A blank page holds none. */
async function inkOn(page: Page, label: string): Promise<number> {
  const canvas = page.getByRole("img", { name: label });
  await canvas.scrollIntoViewIfNeeded();
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) return 0;
    const context = element.getContext("2d");
    if (!context) return 0;
    const { data } = context.getImageData(0, 0, element.width, element.height);
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] ?? 255) < 128 && (data[i + 3] ?? 0) > 0) dark += 1;
    }
    return dark;
  });
}

/** What the policy refused while the page drew its PDF. */
function policyRefusals(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as PolicyWindow).policyRefusals,
  );
}

/**
 * The console's own account of a refusal. The event above is not raised
 * in the page for something refused inside the pdf.js worker, and the
 * console does carry those.
 */
function policyErrors(consoleErrors: string[]): string[] {
  return consoleErrors.filter((text) => /content security policy/i.test(text));
}

test.describe("A PDF drawn page by page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 120_000 });

  test("every page of a longer PDF is drawn, and the policy refuses nothing", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openCertificate(
      { page, browser, request, project: testInfo.project.name },
      THREE_PAGES,
    );

    await expect(page.getByRole("heading", { name: FILE_NAME })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Page \d of 3$/ })).toHaveCount(
      3,
    );
    for (const label of ["Page 1 of 3", "Page 2 of 3", "Page 3 of 3"]) {
      await expect.poll(() => inkOn(page, label), label).toBeGreaterThan(0);
    }

    expect(await policyRefusals(page)).toEqual([]);
    expect(policyErrors(consoleErrors)).toEqual([]);
  });

  test("a PDF that carries its own font is drawn, and the policy refuses nothing", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openCertificate(
      { page, browser, request, project: testInfo.project.name },
      EMBEDDED_FONT,
    );

    await expect(page.getByRole("img", { name: /^Page \d of 2$/ })).toHaveCount(
      2,
    );
    for (const label of ["Page 1 of 2", "Page 2 of 2"]) {
      await expect.poll(() => inkOn(page, label), label).toBeGreaterThan(0);
    }

    expect(await policyRefusals(page)).toEqual([]);
    expect(policyErrors(consoleErrors)).toEqual([]);
  });

  test("the file itself can still be opened", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    await openCertificate(
      { page, browser, request, project: testInfo.project.name },
      THREE_PAGES,
    );

    await expect(
      page.getByRole("button", { name: `Open file: ${FILE_NAME}` }),
    ).toBeVisible();
  });
});
