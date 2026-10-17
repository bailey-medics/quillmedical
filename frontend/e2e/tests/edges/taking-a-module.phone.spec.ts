/**
 * A teaching delegate takes the module on a phone.
 *
 * Story 7 of Phase 9 in
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md. Runs in the
 * `phone` project only, a Pixel 7's screen, below `md`, where the
 * navigation folds behind the hamburger. So the journey gets about the
 * way somebody on a phone does: by opening the menu.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { sitTheAssessment } from "../../fixtures/assessment";
import { makeLearner } from "../../fixtures/people";
import { freshUsername, signIn } from "../../fixtures/signIn";

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Check the menu has closed. It slides out of view rather than leaving
 * the page, so closed is read from `inert`, which takes it out of reach
 * of a tap, the keyboard and a screen reader alike.
 */
async function expectMenuClosed(page: Page): Promise<void> {
  await expect(
    page.getByRole("dialog", { name: "Navigation" }),
  ).toHaveAttribute("inert", "");
}

test.describe.configure({ timeout: 120_000 });

test("a TD signs in, takes the module and sees the result", async ({
  page,
  browser,
}, testInfo) => {
  const username = freshUsername("phone_td", testInfo.project.name);
  await makeLearner(browser, username, "teaching_delegate");

  await signIn(page, username);

  // The menu is behind the hamburger, and gets them about: to the
  // guides, and back to their modules.
  await expect(page.getByRole("complementary")).toBeHidden();
  for (const [link, address] of [
    ["Guides", /\/guides$/],
    ["Teaching", /\/teaching$/],
  ] as const) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("link", { name: link })
      .click();
    await expect(page).toHaveURL(address);
    await expectMenuClosed(page);
  }

  // Tapping the page already open closes the menu too, rather than
  // leaving it over the page.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("dialog", { name: "Navigation" })
    .getByRole("link", { name: "Teaching" })
    .click();
  await expectMenuClosed(page);

  await page.getByRole("link", { name: "View module" }).click();
  await expect(
    page.getByRole("button", { name: "Start assessment" }),
  ).toBeVisible();

  const chosen = await sitTheAssessment(page, "right");
  await expect(
    page.getByRole("heading", { level: 1, name: "Passed" }),
  ).toBeVisible({ timeout: 10_000 });

  // On a phone the results by question are cards, not a table's rows:
  // each answer given is shown, and every one is right.
  await page.getByRole("link", { name: "View results by question" }).click();
  await expect(page).toHaveURL(/\/question-results$/);
  for (const label of chosen) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Fail", { exact: true })).toHaveCount(0);
});
