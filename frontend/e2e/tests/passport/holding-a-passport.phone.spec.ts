/**
 * A holder's passport on a phone.
 *
 * Phase 6 of docs/docs/plans/2026-10-31-passport-landing-views-plan.md,
 * story 25. Run by the `phone` project, a Pixel 7, below `sm`: the
 * framework tables become cards, and the side navigation is behind the
 * hamburger.
 */

import { test, expect } from "../../fixtures/axe";
import { FRAMEWORK_NAMES, makeHolder } from "../../fixtures/passport";
import { signIn } from "../../fixtures/signIn";

const REFER_PALLIATIVE =
  "Refer patients for palliative radiotherapy unsupervised";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

test("25. a holder on a phone opens a competency and adds a logbook entry", async ({
  page,
  browser,
}, testInfo) => {
  const holder = await makeHolder(browser, testInfo.project.name);

  await signIn(page, holder.username);

  // The way in is behind the hamburger.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("link", { name: "Passport" })
    .click();

  // Below `sm` each framework's rows are cards, not a table's rows.
  await expect(
    page.getByRole("heading", { name: FRAMEWORK_NAMES.clinical }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.getByText(REFER_PALLIATIVE).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: REFER_PALLIATIVE }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add an entry" }).click();
  const performed = page.getByRole("textbox", {
    name: "Performed on",
    exact: true,
  });
  await performed.fill("1 October 2026");
  await performed.press("Tab");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("1 entry").first()).toBeVisible();
});
