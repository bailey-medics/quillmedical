/**
 * Waiting for what a person would see, without asking the API.
 *
 * Some saves say nothing when they have landed: Settings saves a change
 * as it is made. A journey checking what the change did opens the page
 * that shows it, and opens it again until the save has landed. See
 * `.claude/rules/e2e.md`.
 */

import { expect, type Page } from "@playwright/test";

/**
 * Open *address* until *check* passes.
 *
 * Thirty seconds, because a passport save rewrites the passport in its
 * bucket, and under a full run's load twenty was once not enough.
 */
export async function openUntil(
  page: Page,
  address: string,
  check: () => Promise<void>,
): Promise<void> {
  await expect(async () => {
    await page.goto(address);
    await check();
  }).toPass({ timeout: 30_000 });
}
