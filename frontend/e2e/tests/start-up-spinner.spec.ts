/**
 * The quill turns from the first paint.
 *
 * Opening Quill used to show a blank page until the app had loaded.
 * index.html now carries a spinner of its own, drawn with nothing but
 * markup and an inline stylesheet, which the app replaces when it
 * starts. Only this stack can prove it: the production content security
 * policy decides whether that stylesheet is applied at all, and the
 * unit tests never see a browser paint.
 */

import { expect, test, type Page } from "@playwright/test";

const BRAND_NAVY = "rgb(0, 26, 54)";

/** Opens the sign-in page with the app's own code kept from loading. */
async function openBeforeTheAppStarts(page: Page): Promise<void> {
  await page.route("**/assets/**/*.js", (route) => route.abort());
  await page.goto("/login");
}

test.describe("start-up spinner", () => {
  test("shows before any of the app has loaded", async ({ page }) => {
    await openBeforeTheAppStarts(page);

    await expect(page.getByRole("status")).toHaveText("Loading");
    await expect(page.locator("#quill-splash-spin")).toBeVisible();
  });

  // An inline stylesheet the policy refused would leave three black
  // feathers, upright and still, and the test above would still pass.
  test("is styled and turning under the content security policy", async ({
    page,
  }) => {
    await openBeforeTheAppStarts(page);

    const quill = await page.locator("#quill-splash-spin").evaluate((spin) => {
      const face = spin.querySelector("svg");

      return {
        fill: face === null ? null : getComputedStyle(face).fill,
        turning: spin.getAnimations().length,
        // The box around the turning part: that part itself is tilted
        // and squashed, so its own outline changes from frame to frame.
        box: spin.closest(".quill-splash-box")?.getBoundingClientRect().height,
      };
    });

    expect(quill.fill).toBe(BRAND_NAVY);
    expect(quill.turning).toBe(1);
    expect(quill.box).toBe(128);
  });

  test("makes a dark page navy from the first paint", async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem("mantine-color-scheme-value", "dark"),
    );
    await openBeforeTheAppStarts(page);

    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      BRAND_NAVY,
    );
  });

  test("gives way to the app once it has loaded", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");

    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.locator("#quill-splash-spin")).toHaveCount(0);
  });
});
