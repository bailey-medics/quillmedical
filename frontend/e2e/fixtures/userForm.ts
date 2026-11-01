/**
 * Drive the add-user form, as an admin does.
 *
 * Every account an end-to-end test needs is made here, on the form, by
 * whoever would make it in a trust: see `.claude/rules/e2e.md`. The steps
 * a form shows depend on who is asking, so `nextUntil` presses Next until
 * the step a caller wants, rather than counting.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** The address a username is given, at a domain that receives no mail. */
export function emailOf(username: string): string {
  return `${username}@example.test`;
}

/** The stepper's own button, matched whole: tables page with "next". */
export function nextButton(page: Page): Locator {
  return page.getByRole("button", { name: "Next", exact: true });
}

/** What the form's first step asks for. */
export interface BasicDetails {
  username: string;
  /** Shown as the full name. */
  name: string;
  /** The base profession, as the form names it: "Teaching delegate". */
  profession: string;
  password: string;
  /** Defaults to `emailOf(username)`. */
  email?: string;
}

/** Fill the form's first step, who they are, and move on. */
export async function fillBasicDetails(
  page: Page,
  details: BasicDetails,
): Promise<void> {
  await page.getByLabel("Full name").fill(details.name);
  await page
    .getByLabel("Email")
    .fill(details.email ?? emailOf(details.username));
  await page.getByLabel("Username").fill(details.username);
  await page.getByLabel("Initial password").fill(details.password);
  await page.getByRole("combobox", { name: "Base profession" }).click();
  await page
    .getByRole("option", { name: details.profession, exact: true })
    .click();
  await nextButton(page).click();
}

/** Choose one option in a multi-select, then close its list. */
export async function choose(
  page: Page,
  field: RegExp,
  option: string,
): Promise<void> {
  await page.getByRole("combobox", { name: field }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  // The list stays open over the button below for more choices.
  await page.keyboard.press("Escape");
}

/**
 * Press Next until *finish* shows.
 *
 * Each press waits for the stepper to move on, so a Next still on screen
 * from the step before is never pressed twice.
 */
export async function nextUntil(page: Page, finish: Locator): Promise<void> {
  const current = page.locator(".mantine-Stepper-step[data-progress]");

  for (let step = 0; step < 8; step += 1) {
    // Wait until the step has drawn one or the other: straight after the
    // stepper moves, Chromium can be asked before either button is there.
    await expect(nextButton(page).or(finish).first()).toBeVisible();
    if (await finish.isVisible()) {
      return;
    }

    const before = await current.innerText();
    await nextButton(page).click();
    await expect(current).not.toHaveText(before);
  }
}

/** Press Next through whatever steps are left, then create the account. */
export async function nextToTheEndAndCreate(page: Page): Promise<void> {
  const create = page.getByRole("button", { name: "Create user" });

  await nextUntil(page, create);
  await create.click();

  // Hashing the password is slow on purpose, and slower again with the
  // other browsers' tests running beside this one. If the form says why
  // it did not save, that is the failure worth reading.
  try {
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 30_000 });
  } catch (error) {
    const said = await page.getByRole("alert").allInnerTexts();
    throw new Error(
      `The user was not created. The form said: ${said.join(" | ")}`,
      {
        cause: error,
      },
    );
  }

  await expect(page.getByText("User created")).toBeVisible();
}

/** Turn on a switch whose input is visually hidden, by its track. */
export async function switchOn(page: Page, name: string): Promise<void> {
  const toggle = page.getByRole("switch", { name });

  await page.locator(`label[for="${await toggle.getAttribute("id")}"]`).click();
  await expect(toggle).toBeChecked();
}
