/**
 * Registering as a new delegate, through the register page.
 *
 * The register page asks for a module and the clinical lead's address,
 * checks the lead, then asks for the account. `seed_ci.py` appoints
 * `ci_lead` clinical lead of "CI Teaching Centre" and opens the module to
 * registration, which is what lets this through.
 */

import { expect, type Page } from "@playwright/test";

/** The clinical lead `seed_ci.py` appoints at CI Teaching Centre. */
export const CLINICAL_LEAD = "ci_lead@ci.local";

/**
 * The address a new delegate registers with.
 *
 * Not `example.test`, which the accounts an admin makes use: registration
 * checks an address could receive mail, and refuses a reserved name such
 * as `.test`. `example.com` passes, and nothing is sent: the stack only
 * captures email.
 */
export function registeringEmailOf(username: string): string {
  return `${username}@example.com`;
}

/** Register from the login page's link, as a new delegate would. */
export async function registerFromTheLoginPage(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByRole("link", { name: /Register/ }).click();
  await expect(page).toHaveURL(/\/register$/);

  await page.getByRole("combobox", { name: "Teaching module" }).click();
  await page.getByRole("option").first().click();
  await page
    .getByRole("textbox", { name: "Clinical lead email address" })
    .fill(CLINICAL_LEAD);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("textbox", { name: "Full name" }).fill("New Delegate");
  await page.getByRole("textbox", { name: "Username" }).fill(username);
  await page
    .getByRole("textbox", { name: "Email" })
    .fill(registeringEmailOf(username));
  await page
    .getByRole("textbox", { name: "Password", exact: true })
    .fill(password);
  await page.getByRole("textbox", { name: "Confirm password" }).fill(password);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/verify-email-pending/, { timeout: 30_000 });
}
