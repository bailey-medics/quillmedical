/**
 * A teaching admin deactivates a site.
 *
 * Phase 15 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * Runs as `educator`, the seeded teaching admin, on a site made for the
 * test inside "CI Teaching Hospital". Three people are put there on the
 * add-user form: a delegate at that site alone, a delegate also at "CI
 * Teaching Annexe", and the site's clinical lead, named on the site's
 * edit page. Deactivating it closes the accounts of the two who belong
 * nowhere else, emails them, and spares the one at the Annexe; the site
 * then takes nobody new, and its lead's address admits nobody at
 * registration. Nothing here calls the API: see `.claude/rules/e2e.md`.
 */

import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { waitForEmail } from "../../fixtures/mail";
import { addSite, makeAtSites } from "../../fixtures/people";
import { PLACES, freshUsername } from "../../fixtures/signIn";
import { searchRow } from "../../fixtures/tables";
import { emailOf } from "../../fixtures/userForm";

test.describe.configure({ timeout: 180_000 });

/** Name *username* clinical lead of site *siteId*, on its edit page. */
async function nameLead(
  page: Page,
  siteId: number,
  username: string,
): Promise<void> {
  await page.goto(`/admin/sites/${siteId}/edit`);
  await page.getByRole("combobox", { name: "Clinical lead" }).click();
  await page
    .getByRole("option", { name: `${username} (${emailOf(username)})` })
    .click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/sites/${siteId}$`));
  // Beside its label: the address shows in the staff list as well.
  await expect(
    page.getByText("Clinical lead email:").locator(".."),
  ).toContainText(emailOf(username));
}

/**
 * Start registering for the module with *lead*'s address, signed out, and
 * return the page, which says where it would join or that the lead was
 * not found.
 */
async function registerWithLead(browser: Browser, lead: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto("/register");
  await page.getByRole("combobox", { name: "Teaching module" }).click();
  await page.getByRole("option").first().click();
  await page
    .getByRole("textbox", { name: "Clinical lead email address" })
    .fill(emailOf(lead));
  await page.getByRole("button", { name: "Continue" }).click();

  return page;
}

/**
 * Check *username*'s account is open or closed, as their admin page shows
 * it: an open account is offered "Deactivate", a closed one "Reactivate".
 */
async function expectAccount(
  page: Page,
  username: string,
  open: boolean,
): Promise<void> {
  await page.goto("/admin/users");
  await searchRow(page, username);
  // By their username's text, not a table row: a phone shows cards.
  await page.getByText(username, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+$/);

  await expect(
    page.getByRole("button", {
      name: open ? "Deactivate" : "Reactivate",
      exact: true,
    }),
  ).toBeVisible();
}

test("deactivates a site, closing the accounts of people with nowhere else", async ({
  page,
  browser,
}, testInfo) => {
  const project = testInfo.project.name;
  const name = freshUsername("Closing site", project);
  const siteId = await addSite(page.context(), name);

  const alone = freshUsername("closing_alone", project);
  const elsewhere = freshUsername("closing_elsewhere", project);
  const lead = freshUsername("closing_lead", project);
  await makeAtSites(browser, alone, "teaching_delegate", [name]);
  await makeAtSites(browser, elsewhere, "teaching_delegate", [
    name,
    PLACES.annexe,
  ]);
  await makeAtSites(browser, lead, "teaching_clinical_lead", [name]);
  await nameLead(page, siteId, lead);

  // Before: the lead's address admits somebody to the site.
  const before = await registerWithLead(browser, lead);
  await expect(
    before.getByRole("heading", { name: `Joining ${name}` }),
  ).toBeVisible();
  await before.context().close();

  // The red button, and a modal that says how many accounts go with it.
  await page.goto(`/admin/sites/${siteId}/edit`);
  await page.getByRole("button", { name: "Deactivate site" }).click();
  const dialog = page.getByRole("dialog", { name: "Deactivate site" });
  await expect(dialog).toContainText(
    "Deactivating this site will also deactivate the accounts of anyone that does not belong to a second organisation or site.",
  );
  await expect(dialog).toContainText("2 accounts will be deactivated");
  await dialog.getByRole("button", { name: "Deactivate" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/sites/${siteId}$`));
  await expect(page.getByText("Site deactivated")).toBeVisible();
  await expect(page.getByText("2 accounts were deactivated")).toBeVisible();
  await expect(page.getByText("Deactivated", { exact: true })).toBeVisible();

  // Nobody can be added: there is no button. The backend test
  // `test_nobody_can_be_added_through_its_page` refuses the request.
  await expect(page.getByRole("button", { name: "Add staff" })).toHaveCount(0);

  // The two with nowhere else are closed and told; the one also at the
  // Annexe is not.
  await expectAccount(page, alone, false);
  await expectAccount(page, lead, false);
  await expectAccount(page, elsewhere, true);
  await waitForEmail(emailOf(alone));
  await waitForEmail(emailOf(lead));

  // And the lead's address admits nobody at registration. The backend
  // test `test_a_lead_at_a_deactivated_site_admits_nobody` makes the
  // refusal itself.
  const after = await registerWithLead(browser, lead);
  await expect(after.getByText("Clinical lead not found")).toBeVisible();
  await after.context().close();
});
