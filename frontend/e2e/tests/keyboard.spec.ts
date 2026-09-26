/**
 * Keyboard-only journeys: no mouse, no clicks, only Tab, Shift+Tab,
 * typing and Enter. Assertions are on where focus is, which axe cannot
 * judge (WCAG 2.1.1 Keyboard, 2.4.3 Focus order).
 */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../fixtures/axe";
import { pressToSlide } from "../fixtures/slides";
import { CI_TOTP_SECRET, totpCode } from "../fixtures/totp";

/**
 * The key that moves to the next control, links included. Safari's Tab
 * skips links unless the user turns on "Press Tab to highlight each item";
 * Option+Tab reaches them, and WebKit here behaves the same. So on WebKit
 * the journeys use Option+Tab, as a Safari keyboard user would.
 */
function nextKey(browserName: string): string {
  return browserName === "webkit" ? "Alt+Tab" : "Tab";
}

/**
 * Press Tab until `target` has focus, and return what was passed on the
 * way. Fails if it is not reached within `limit` presses, which is what
 * catches a control the keyboard cannot get to.
 */
async function tabTo(page: Page, target: Locator, key: string, limit = 15) {
  const passed: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    await page.keyboard.press(key);
    if (await target.evaluate((el) => el === document.activeElement)) {
      return passed;
    }
    passed.push(
      await page.evaluate(
        () =>
          document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.textContent?.trim().slice(0, 30) ??
          "",
      ),
    );
  }
  throw new Error(`Not reached in ${limit} Tab presses; passed ${passed}`);
}

test.describe("Keyboard only", () => {
  test.describe.configure({ timeout: 90_000 });

  test.describe("logging in with two-factor authentication", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("works from the keyboard alone", async ({ page, browserName }) => {
      // The login page has no layout, so no navigation to skip and no
      // skip link: the first stops are the form's own fields
      await page.goto("/login");
      await page.waitForLoadState("networkidle");

      const username = page.getByLabel("Username");
      await tabTo(page, username, nextKey(browserName));
      await page.keyboard.type("twofactor");
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("textbox", { name: "Password" }),
      ).toBeFocused();
      await page.keyboard.type("twofactor123");
      await page.keyboard.press("Enter");

      // The server asks for a code; focus moves straight to the new field
      const code = page.getByLabel(/authenticator code/i);
      await expect(code).toBeFocused({ timeout: 15_000 });
      await page.keyboard.type(totpCode(CI_TOTP_SECRET));
      await page.keyboard.press("Enter");

      await expect
        .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
        .toMatch(/^\/($|teaching)/);
    });
  });

  test("the skip link lands in the page and past the navigation", async ({
    page,
    browserName,
  }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");

    await page.keyboard.press(nextKey(browserName));
    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");

    // Focus is on the content wrapper inside main, past the ribbon and
    // the side navigation
    await expect(page.locator("#main-content")).toBeFocused();
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("main")),
    ).toBe(true);
  });

  test("a lecture opens from the dashboard", async ({ page, browserName }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");
    const key = nextKey(browserName);

    // The module seed_ci.py opens, fetched by
    // .github/scripts/ci/fetch-e2e-teaching.sh
    await tabTo(page, page.getByRole("link", { name: "View module" }), key, 30);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teaching\/chest-xray-interpretation-test$/);

    const startLearning = page.getByRole("button", { name: "Start learning" });
    await expect(startLearning).toBeVisible({ timeout: 10_000 });
    await tabTo(page, startLearning, key, 30);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(
      /\/learn\/chest-xray-interpretation-test\/slide\/0$/,
    );

    // The slides turn with the arrow keys as well as their buttons
    await pressToSlide(page, "ArrowRight", /\/slide\/1$/);
  });

  test("the side navigation reaches settings", async ({
    page,
    browserName,
  }) => {
    await page.goto("/teaching");
    await page.waitForLoadState("networkidle");

    const settings = page
      .getByRole("complementary")
      .getByRole("link", { name: /settings/i });
    await tabTo(page, settings, nextKey(browserName), 30);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/settings/);
  });
});
