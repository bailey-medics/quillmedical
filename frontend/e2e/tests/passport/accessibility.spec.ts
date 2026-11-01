/**
 * Every passport page passes the axe scan, light and dark.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * story 26. Scanned with something on each page, not empty, so the scan
 * sees tables and cards as a holder would: a logbook entry, a CPD
 * activity, a reflection and a waiting sign-off.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { send } from "../../fixtures/api";
import { makeAssessor, makeHolder, type Holder } from "../../fixtures/passport";
import { signIn } from "../../fixtures/signIn";

const REFER_PALLIATIVE = "ghnft_radiotherapy_record_refer_palliative";

/** Give *holder* one of each record, and ask *assessorEmail* to sign. */
async function fillThePassport(
  page: Page,
  holder: Holder,
  assessorEmail: string,
): Promise<void> {
  const base = `/passport/${holder.passportId}`;
  const writes: [string, unknown][] = [
    [`${base}/logbook/${REFER_PALLIATIVE}`, { performed_on: "2026-10-01" }],
    [
      `${base}/cpd`,
      {
        activity_on: "2026-10-01",
        title: "Regional study day",
        activity_type: "teaching day",
        points: 6,
      },
    ],
    [
      `${base}/reflections`,
      {
        title: "A difficult airway",
        written_on: "2026-10-01",
        body: "What I would do differently.",
        anonymised_confirmed: true,
      },
    ],
    [
      `${base}/competencies/${REFER_PALLIATIVE}/requests`,
      { assessor_email: assessorEmail, observed_on: "2026-10-01" },
    ],
  ];

  for (const [path, body] of writes) {
    const response = await send(page, "POST", path, body);
    expect(response.status(), `${path}: ${await response.text()}`).toBe(201);
  }
}

test.describe("Passport accessibility", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 240_000 });

  test("26. every passport page passes the axe scan, light and dark", async ({
    page,
    browser,
    scanPage,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);

    await signIn(page, holder.username);
    await fillThePassport(page, holder, assessor.email);

    const pages: [string, string, string][] = [
      ["/passport", "landing-by-competency", "My passport"],
      [
        `/passport/competencies/${REFER_PALLIATIVE}`,
        "competency",
        "Refer patients for palliative radiotherapy unsupervised",
      ],
      ["/passport/sign-offs", "sign-offs", "Sign-offs"],
      ["/passport/logbook", "logbook", "Logbook"],
      ["/passport/cpd", "cpd", "Continuing professional development"],
      ["/passport/certificates", "certificates", "Certificates"],
      ["/passport/reflections", "reflections", "Reflections"],
      ["/passport/download", "download", "Download"],
    ];

    for (const [address, name, heading] of pages) {
      await page.goto(address);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await scanPage(`passport-${name}`);
    }

    // The By record view, chosen in Settings.
    await page.goto("/settings");
    await page.getByRole("radio", { name: "By record" }).check();
    await page.goto("/passport");
    await expect(
      page.getByRole("button", { name: "Open sign-offs" }),
    ).toBeVisible();
    await scanPage("passport-landing-by-record");

    // The assessor's sign-off page, reached from their inbox, on the
    // same page so the scan sees it.
    await page.context().clearCookies();
    await signIn(page, assessor.username);
    await page.goto("/inbox");
    await page
      .getByText("Refer patients for palliative radiotherapy unsupervised")
      .first()
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign off" }),
    ).toBeVisible();
    await scanPage("passport-assessor-sign-off");
  });
});
