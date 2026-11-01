/**
 * Every passport page passes the axe scan, light and dark.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * story 26. Scanned with something on each page, not empty, so the scan
 * sees tables and cards as a holder would: a logbook entry, a CPD
 * activity, a reflection and a waiting sign-off, each made on screen
 * (Phase 7).
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import {
  REFER_PALLIATIVE,
  addLogbookEntry,
  askForSignOff,
  makeAssessor,
  makeHolder,
  openCompetency,
  recordCpd,
  writeReflection,
} from "../../fixtures/passport";
import { signIn } from "../../fixtures/signIn";

/**
 * Give the signed-in holder one of each record, and ask *assessorEmail*
 * to sign, each on the page a holder would use.
 */
async function fillThePassport(
  page: Page,
  assessorEmail: string,
): Promise<void> {
  await addLogbookEntry(page);
  await recordCpd(page, "Regional study day");
  await writeReflection(page, "A difficult airway");
  await openCompetency(page);
  await askForSignOff(page, assessorEmail);
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
    await fillThePassport(page, assessor.email);

    const pages: [string, string, string][] = [
      ["/passport", "landing-by-competency", "My passport"],
      [
        `/passport/competencies/${REFER_PALLIATIVE.id}`,
        "competency",
        REFER_PALLIATIVE.name,
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
    await page.getByText(REFER_PALLIATIVE.name).first().click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign off" }),
    ).toBeVisible();
    await scanPage("passport-assessor-sign-off");
  });
});
