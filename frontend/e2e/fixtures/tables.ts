/**
 * Find a row in one of the app's tables, searching rather than paging.
 *
 * The tables show ten rows a page, and every run of the end-to-end tests
 * adds accounts, so a row a test has just made is often not on the first
 * page. Each table has its own search behind an "Open search" button.
 */

import type { Locator, Page } from "@playwright/test";

/**
 * The card holding one of a page's tables, found by its heading.
 *
 * For a page with more than one table, such as an organisation's, where
 * each has its own search.
 */
export function cardTitled(page: Page, heading: string): Locator {
  return page
    .locator("div")
    .filter({ has: page.getByRole("heading", { name: heading, level: 2 }) })
    .last();
}

/**
 * Search a table for *text* and return the row that matches.
 *
 * @param scope - The page, or the part of it holding one table, when a
 *   page has more than one.
 */
export async function searchRow(
  scope: Page | Locator,
  text: string,
): Promise<Locator> {
  await scope.getByRole("button", { name: "Open search" }).click();
  await scope.getByRole("textbox", { name: "Search" }).fill(text);

  return scope.getByRole("row", { name: new RegExp(text) });
}
