/**
 * Takes one screenshot for a guide.
 *
 * `name` is the image's place beneath the guide assets, without its
 * `.png`: `add-a-delegate-by-hand/users`. It is what the guide's markdown
 * names, and `frontend/src/guides/screenshots.test.ts` holds the two
 * lists equal by reading these calls, so pass it as a plain string.
 *
 * The images go to `public/guide-assets/` unless `GUIDE_ASSETS_DIR` says
 * otherwise. Git ignores the folder and the Vite dev server serves it.
 */

import path from "path";
import type { Page } from "@playwright/test";

const OUTPUT = process.env.GUIDE_ASSETS_DIR ?? "public/guide-assets";

export async function shot(page: Page, name: string): Promise<void> {
  // Whatever was last hovered or focused would be photographed lit up.
  await page.mouse.move(0, 0);
  // Fonts arrive after the first paint, and a screenshot taken before
  // them shows the fallback face.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(OUTPUT, `${name}.png`),
    animations: "disabled",
  });
}
