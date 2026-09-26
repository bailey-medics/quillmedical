/**
 * Turning a learning slide with the keyboard.
 *
 * SlideReader binds its arrow-key handler in an effect, which runs just
 * after the slide renders. A key pressed in that gap reaches the previous
 * slide's handler, or none, and the slide does not move. No person types
 * that fast, but Playwright does, so a single press is flaky. This presses
 * again only when the address has not moved, which a press that landed
 * never needs.
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function pressToSlide(
  page: Page,
  key: "ArrowRight" | "ArrowLeft",
  url: RegExp,
): Promise<void> {
  await expect(async () => {
    if (!url.test(page.url())) await page.keyboard.press(key);
    await expect(page).toHaveURL(url, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}
