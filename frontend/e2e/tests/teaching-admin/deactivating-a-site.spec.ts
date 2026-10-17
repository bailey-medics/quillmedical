/**
 * A teaching admin deactivates a site.
 *
 * Phase 15 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * Runs as `educator`, the seeded teaching admin, on a site made for the
 * test inside "CI Teaching Hospital". Three people are put there through
 * the API: a delegate at that site alone, a delegate also at "CI Teaching
 * Annexe", and the site's clinical lead. Deactivating it closes the
 * accounts of the two who belong nowhere else, emails them, and spares
 * the one at the Annexe; the site then takes nobody new, and its lead's
 * address admits nobody at registration.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { MODULE_ID } from "../../fixtures/answers";
import {
  createAccount,
  emailOf,
  orgUnitId,
  read,
  send,
} from "../../fixtures/api";
import { waitForEmail } from "../../fixtures/mail";
import { PLACES, freshUsername } from "../../fixtures/signIn";

test.describe.configure({ timeout: 120_000 });

/** Make an account at *sites*, and hand back its id. */
async function personAt(
  page: Page,
  username: string,
  profession: string,
  sites: number[],
): Promise<number> {
  return createAccount(page, {
    username,
    name: `Person ${username}`,
    profession,
    orgUnitIds: sites,
  });
}

/** Whether an account is open, as its admin page reads it. */
async function isOpen(page: Page, userId: number): Promise<boolean> {
  const user = await read<{ is_active: boolean }>(page, `/users/${userId}`);

  return user.is_active;
}

test("deactivates a site, closing the accounts of people with nowhere else", async ({
  page,
}, testInfo) => {
  const project = testInfo.project.name;
  const name = freshUsername("Closing site", project);
  const created = await send(page, "POST", "/org-units", {
    name,
    type: "site",
    parent_id: await orgUnitId(page, PLACES.organisation),
  });
  expect(created.status(), await created.text()).toBe(200);
  const siteId = ((await created.json()) as { id: number }).id;
  const annexeId = await orgUnitId(page, PLACES.annexe);

  const alone = freshUsername("closing_alone", project);
  const elsewhere = freshUsername("closing_elsewhere", project);
  const lead = freshUsername("closing_lead", project);
  const aloneId = await personAt(page, alone, "teaching_delegate", [siteId]);
  const elsewhereId = await personAt(page, elsewhere, "teaching_delegate", [
    siteId,
    annexeId,
  ]);
  const leadId = await personAt(page, lead, "teaching_clinical_lead", [siteId]);
  const named = await send(page, "PUT", `/org-units/${siteId}/clinical-lead`, {
    user_id: leadId,
  });
  expect(named.status(), await named.text()).toBe(200);

  // Before: the lead's address admits somebody to the site.
  const checkLead = () =>
    page.request.post("/api/teaching/public/validate-clinical-lead", {
      data: { email: emailOf(lead), bank_id: MODULE_ID },
    });
  expect(await (await checkLead()).json()).toMatchObject({ valid: true });

  // The red button, and a modal that says how many accounts go with it.
  await page.goto(`/admin/sites/${siteId}/edit`);
  await page.getByRole("button", { name: "Deactivate site" }).click();
  // Found by its words: `ConfirmModal` gives its dialog no name.
  const dialog = page
    .getByRole("dialog")
    .filter({ hasText: "Deactivating this site" });
  await expect(dialog).toContainText(
    "Deactivating this site will also deactivate the accounts of anyone that does not belong to a second organisation or site.",
  );
  await expect(dialog).toContainText("2 accounts will be deactivated");
  await dialog.getByRole("button", { name: "Deactivate" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/sites/${siteId}$`));
  await expect(page.getByText("Site deactivated")).toBeVisible();
  await expect(page.getByText("2 accounts were deactivated")).toBeVisible();
  await expect(page.getByText("Deactivated", { exact: true })).toBeVisible();

  // The two with nowhere else are closed and told; the one also at the
  // Annexe is not.
  expect(await isOpen(page, aloneId)).toBe(false);
  expect(await isOpen(page, leadId)).toBe(false);
  expect(await isOpen(page, elsewhereId)).toBe(true);
  await waitForEmail(emailOf(alone));
  await waitForEmail(emailOf(lead));

  // Nobody can be added: no button, and the API refuses.
  await expect(page.getByRole("button", { name: "Add staff" })).toHaveCount(0);
  const added = await send(page, "POST", `/org-units/${siteId}/members`, {
    user_id: elsewhereId,
    capacity: "trainee",
  });
  expect(added.status()).toBe(409);

  // And the lead's address admits nobody at registration.
  expect(await (await checkLead()).json()).toMatchObject({ valid: false });
});
