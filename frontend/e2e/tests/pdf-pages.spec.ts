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
 * The stack seeds no passport, so the three API answers the page needs
 * are supplied here. Everything else is real: the app, its worker, its
 * policy and the PDF bytes.
 */

import { expect, test, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));

const THREE_PAGES = path.join(
  here,
  "../../public/mock-documents/6_three_page_letter.pdf",
);
const EMBEDDED_FONT = path.join(here, "../fixtures/embedded-font-letter.pdf");

const PASSPORT_ID = "e2e-passport";
const CERTIFICATE = "2026-10-01-example";
const ATTACHMENT = "0123456789abcdef";

interface PolicyWindow {
  policyRefusals: string[];
}

/**
 * Opens the certificate page as somebody holding a passport with one
 * certificate, whose attached file is the PDF at `pdfPath`. The browser
 * is made to report no PDF viewer, as Chrome on Android does, so the
 * pages are drawn with pdf.js in every engine these tests run in.
 */
async function openCertificate(page: Page, pdfPath: string): Promise<void> {
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

  // The signed-in user as they are, plus what the passport's gates ask.
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const user = await response.json();
    await route.fulfill({
      response,
      json: {
        ...user,
        owns_passport: true,
        enabled_features: [...(user.enabled_features ?? []), "passport"],
        competencies: [
          ...(user.competencies ?? []),
          "assess_clinician_passport",
        ],
      },
    });
  });

  await page.route("**/api/passport/me", (route) =>
    route.fulfill({
      json: {
        passport: {
          passport_id: PASSPORT_ID,
          holder_user_id: "1",
          holder_name: "Example Holder",
          registrations: [],
          specialties: [],
          created_at: "2026-10-01",
          head_commit: null,
        },
        competencies: [],
        entitlement: null,
      },
    }),
  );

  await page.route(`**/api/passport/${PASSPORT_ID}/certificates`, (route) =>
    route.fulfill({
      json: [
        {
          name: CERTIFICATE,
          id: CERTIFICATE,
          title: "Example certificate",
          issuer: "Example College",
          awarded_on: "2026-10-01",
          expires_on: null,
          competencies: [],
          description: null,
          attachments: [
            {
              hash: ATTACHMENT,
              filename: "Example letter.pdf",
              size_bytes: 1024,
              media_type: "application/pdf",
            },
          ],
        },
      ],
    }),
  );

  await page.route(
    `**/api/passport/${PASSPORT_ID}/certificates/${CERTIFICATE}/attachments/${ATTACHMENT}`,
    (route) => route.fulfill({ path: pdfPath, contentType: "application/pdf" }),
  );

  await page.goto(`/passport/certificates/${CERTIFICATE}`);
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
  // A service worker would answer the app's requests itself, and the
  // answers supplied above would never be asked for.
  test.use({ serviceWorkers: "block" });

  test("every page of a longer PDF is drawn, and the policy refuses nothing", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openCertificate(page, THREE_PAGES);

    await expect(
      page.getByRole("heading", { name: "Example letter.pdf" }),
    ).toBeVisible();
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
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openCertificate(page, EMBEDDED_FONT);

    await expect(page.getByRole("img", { name: /^Page \d of 2$/ })).toHaveCount(
      2,
    );
    for (const label of ["Page 1 of 2", "Page 2 of 2"]) {
      await expect.poll(() => inkOn(page, label), label).toBeGreaterThan(0);
    }

    expect(await policyRefusals(page)).toEqual([]);
    expect(policyErrors(consoleErrors)).toEqual([]);
  });

  test("the file itself can still be opened", async ({ page }) => {
    await openCertificate(page, THREE_PAGES);

    await expect(
      page.getByRole("button", { name: "Open file: Example letter.pdf" }),
    ).toBeVisible();
  });

  test("the scanned-image decoders are served as scripts from this origin", async ({
    request,
  }) => {
    // pdf.js fetches these by name only when a scan needs one, so a
    // build that stopped emitting them would otherwise go unnoticed
    // until somebody opened such a scan.
    for (const name of [
      "jbig2_nowasm_fallback.js",
      "openjpeg_nowasm_fallback.js",
    ]) {
      const response = await request.get(`/pdfjs/${name}`);

      expect(response.status(), name).toBe(200);
      expect(response.headers()["content-type"], name).toContain("javascript");
    }
  });
});
