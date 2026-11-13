/**
 * One sign-off followed from the ask to the printed record.
 *
 * Every step here has a spec of its own: asking in
 * holding-a-passport.spec.ts story 4, signing in assessing.spec.ts story
 * 13, downloading in story 11. This is the one that follows a single
 * sign-off through all of them, and checks its fingerprint where a
 * person would: on the sign-off's page, in the PDF and in the bundle.
 *
 * The test never works a fingerprint out itself. That would copy the
 * rules in backend/app/features/passport/hashing.py into the test, where
 * they would drift, and a mistake shared by both copies would pass. The
 * backend's tests pin how it is worked out: hashing_test.py, and
 * router_test.py's `TestSignOff`, which finds a record edited after
 * signing no longer matches. This spec pins what only the whole journey
 * shows: Quill's own check of the stored record, read on screen, and
 * the printed fingerprint agreeing with the stored one.
 *
 * Phase 18 of docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
 */

import { test, expect } from "../../fixtures/axe";
import {
  EXAMINE_THE_CHEST,
  askAsHolder,
  makeAssessor,
  makeHolder,
  signFromTheInbox,
} from "../../fixtures/passport";
import { textOfPdf } from "../../fixtures/pdfText";
import { signIn } from "../../fixtures/signIn";
import { textInZip } from "../../fixtures/zip";

/** What the sign-off's page says of a record unchanged since signing. */
const MATCHES =
  "Matches. Nothing in this sign-off has changed since it was signed.";

/** The fingerprint the bundle's record carries, as `content_hash:`. */
const STORED_FINGERPRINT = /content_hash:\s*['"]?(sha256:[0-9a-f]{64})/;

test.describe("The whole passport journey", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 180_000 });

  test("33. a sign-off is asked for, signed, checked and printed with its fingerprint", async ({
    page,
    browser,
  }, testInfo) => {
    const holder = await makeHolder(browser, testInfo.project.name);
    const assessor = await makeAssessor(browser, testInfo.project.name);

    // 1. The holder asks, from the competency's page.
    await askAsHolder(browser, holder, assessor.email);

    // 2. The assessor signs it from their inbox, in a browser of their own.
    const assessorPage = await (
      await browser.newContext({ storageState: { cookies: [], origins: [] } })
    ).newPage();
    await signIn(assessorPage, assessor.username);
    await signFromTheInbox(assessorPage);
    await assessorPage.context().close();

    // 3. The holder opens the signed sign-off and reads Quill's check.
    await signIn(page, holder.username);
    await page.goto("/passport/sign-offs");
    await page.getByText(EXAMINE_THE_CHEST.name).first().click();
    await expect(page).toHaveURL(/\/passport\/sign-offs\//);
    await expect(page.getByText("Signed off").first()).toBeVisible();
    await expect(page.getByText(MATCHES)).toBeVisible();

    // 4. The holder downloads the PDF and the full bundle.
    await page.goto("/passport/download");
    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF" }).click();
    const pdf = await (await pdfDownload).path();
    const bundleDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Full bundle" }).click();
    const bundle = await (await bundleDownload).path();

    // 5. The bundle's record carries the fingerprint stored at signing.
    const record = textInZip(bundle, "/sign-off.yaml");
    const stored = STORED_FINGERPRINT.exec(record)?.[1];
    expect(stored, "the bundle's record names no fingerprint").toBeTruthy();

    // 6. The PDF prints the sign-off, who signed it, and that fingerprint.
    const printed = await textOfPdf(pdf);
    expect(printed).toContain(EXAMINE_THE_CHEST.name.replace(/\s+/g, ""));
    expect(printed).toContain(assessor.username);
    expect(printed).toContain(`Fingerprint${stored}`);
  });
});
