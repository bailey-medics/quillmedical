/**
 * What the delegate's journeys need to reach things at a phone's width.
 *
 * The `phone` project runs them on a Pixel 7's screen. Below `md` (62em,
 * 992px) the side panel folds into the menu drawer behind the hamburger,
 * and a table becomes a stack of cards, so a test reaches each the way a
 * phone user does. Phase 21 of
 * docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 */

import { expect, type Locator, type Page } from "@playwright/test";

/** Where the side panel folds into the menu: `md`, 62em. */
const MENU_FOLDS_BELOW = 992;

/** Whether the page is narrower than the width the menu folds away at. */
export function atPhoneWidth(page: Page): boolean {
  const width = page.viewportSize()?.width ?? MENU_FOLDS_BELOW;

  return width < MENU_FOLDS_BELOW;
}

/**
 * The lesson's list of slides: the side panel at desktop width, or the
 * menu drawer, opened first, where it is behind the hamburger.
 *
 * Call it again after choosing a slide: on a phone, choosing one closes
 * the menu, as tapping a link in it does.
 */
export async function slideList(page: Page): Promise<Locator> {
  if (!atPhoneWidth(page)) {
    return page.getByRole("complementary");
  }

  const menu = page.getByRole("dialog", { name: "Navigation" });

  if ((await menu.getAttribute("inert")) !== null) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await expect(menu).not.toHaveAttribute("inert", "");

  return menu;
}

/**
 * Close the slide list where it covers the slide, as a phone user does:
 * the hamburger, which reads "Close navigation" while the menu is open.
 * Nothing to do at desktop width, where it never covers the slide.
 */
export async function closeSlideList(page: Page): Promise<void> {
  if (!atPhoneWidth(page)) return;

  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Navigation" }),
  ).toHaveAttribute("inert", "");
}
