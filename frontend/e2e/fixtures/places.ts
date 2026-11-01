/**
 * Finding a place or a person on screen, and checking somebody else cannot.
 *
 * A leak test shows a thing to whoever it belongs to first, then checks
 * it is nowhere for somebody else: see `.claude/rules/e2e.md`. Its address
 * comes from where its owner opened it, never from the API.
 */

import { expect, type Page } from "@playwright/test";
import { searchRow } from "./tables";

/** Open *text* from the list at *listAddress*, and return the id it opens at. */
async function idFromTheList(
  page: Page,
  listAddress: string,
  text: string,
  opens: RegExp,
): Promise<number> {
  await page.goto(listAddress);
  await searchRow(page, text);
  // By its text, not a table row: a phone shows cards.
  await page.getByText(text, { exact: true }).first().click();
  await expect(page).toHaveURL(opens);

  return Number(opens.exec(new URL(page.url()).pathname)?.[1]);
}

/** The ids of an organisation, a site and a person, as *page*'s admin finds them. */
export interface PlaceIds {
  organisation: number;
  site: number;
  person: number;
}

/**
 * Find *organisation*, *site* and the person *username* on the admin
 * lists, as the admin signed in on *page* does, and return their ids.
 */
export async function idsOnScreen(
  page: Page,
  organisation: string,
  site: string,
  username: string,
): Promise<PlaceIds> {
  return {
    organisation: await idFromTheList(
      page,
      "/admin/organisations",
      organisation,
      /\/admin\/organisations\/(\d+)$/,
    ),
    site: await idFromTheList(
      page,
      "/admin/sites",
      site,
      /\/admin\/sites\/(\d+)$/,
    ),
    person: await idFromTheList(
      page,
      "/admin/users",
      username,
      /\/admin\/users\/(\d+)$/,
    ),
  };
}

/**
 * Open *address* and check it is refused as a person sees it: the page
 * says it could not load, and the name it would have shown is not its
 * heading. An organisation shows the not-found page, and a site or a
 * person says it could not be loaded.
 */
export async function expectNotOpened(
  page: Page,
  address: string,
  name: string,
): Promise<void> {
  await page.goto(address);

  await expect(
    page
      .getByText("404 - Page not found")
      .or(page.getByText("Error loading site"))
      .or(page.getByText("Error loading user")),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name })).toHaveCount(0);
}
