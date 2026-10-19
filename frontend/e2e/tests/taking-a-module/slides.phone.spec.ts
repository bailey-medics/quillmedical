/**
 * A delegate moves through the lesson on a phone by swiping.
 *
 * Phase 21 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
 * Runs in the `phone` project only. A swipe left goes to the next slide
 * and a swipe right to the one before. On a slide that plays a video a
 * swipe changes nothing, so a swipe meant for the player cannot carry
 * the learner off it; there they tap Next. The slides are read from the
 * pinned content (`fixtures/learning.ts`), so a slide added there is
 * swiped through too.
 */

import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/axe";
import { MODULE_ID } from "../../fixtures/answers";
import { knownSlides } from "../../fixtures/learning";
import { makeLearner } from "../../fixtures/people";
import { freshUsername, signIn } from "../../fixtures/signIn";

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

/** Send one touch event at *x* on the slide's heading. */
async function touch(
  page: Page,
  type: "touchstart" | "touchend",
  x: number,
): Promise<void> {
  await page
    .getByRole("main")
    .getByRole("heading", { level: 1 })
    .evaluate(
      (target, [eventType, clientX]) => {
        const point = new Touch({
          identifier: 1,
          target,
          clientX: Number(clientX),
          clientY: 300,
        });

        target.dispatchEvent(
          new TouchEvent(String(eventType), {
            touches: eventType === "touchstart" ? [point] : [],
            changedTouches: [point],
            bubbles: true,
          }),
        );
      },
      [type, x] as const,
    );
}

/**
 * Swipe across the slide, as a finger does: a touch that starts at one
 * side of the screen and, a moment later, ends at the other.
 * `SlideReader` keeps where it started and moves for anything over 50
 * pixels, so the two are sent apart, as a finger sends them, not in the
 * same instant.
 */
async function swipe(page: Page, direction: "left" | "right"): Promise<void> {
  const [from, to] = direction === "left" ? [300, 60] : [60, 300];

  await touch(page, "touchstart", from);
  await page.waitForTimeout(100);
  await touch(page, "touchend", to);
}

/** The slide the address says is showing. */
function onSlide(index: number): RegExp {
  return new RegExp(`/slide/${index}$`);
}

test("swipes through every slide, and back one", async ({
  page,
  browser,
}, testInfo) => {
  const slides = knownSlides();
  const username = freshUsername("swipe_td", testInfo.project.name);
  await makeLearner(browser, username, "teaching_delegate");
  await signIn(page, username);
  await page.goto(`/teaching/learn/${MODULE_ID}/slide/0`);

  for (const [index, slide] of slides.entries()) {
    await expect(page).toHaveURL(onSlide(index));
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: slide.title,
        exact: true,
      }),
    ).toBeVisible();

    if (index === slides.length - 1) break;

    if (slide.plays) {
      // A swipe on the player is the player's: the slide stays.
      await swipe(page, "left");
      await expect(page).toHaveURL(onSlide(index));
      await page.getByRole("button", { name: "Next", exact: true }).click();
    } else {
      await swipe(page, "left");
    }
  }

  // Back one, from the last slide, which plays nothing.
  const last = slides.length - 1;
  expect(slides[last].plays).toBe(false);
  await swipe(page, "right");
  await expect(page).toHaveURL(onSlide(last - 1));
});
