/**
 * A feature whose background fetch failed can still be opened.
 *
 * Once somebody is signed in and idle, Quill fetches the code for the other
 * features they can open (Phase 7 of
 * docs/docs/plans/2026-10-04-lazy-load-one-chunk-per-feature-plan.md). When
 * one of those fetches fails, nothing is said and nothing reloads. The
 * question here is what happens next, when the connection is back and the
 * person clicks into that feature.
 *
 * The background fetch uses `fetch()`, into the browser's cache, and
 * imports nothing. That is what this test holds it to. A failed `import()`
 * is remembered by the browser for the life of the page, so if the
 * background fetch ever goes back to importing, the click here fails and
 * the recovery has to reload the page to get through. A failed `fetch()`
 * leaves nothing behind, so the click opens the feature with no reload.
 */

import { expect, test } from "@playwright/test";

const ADMIN_CHUNK = /\/assets\/adminChunk-[^/]+\.js$/;

interface MarkedWindow {
  quillNotReloaded?: boolean;
}

test.describe("A feature whose background fetch failed", () => {
  // Playwright cannot intercept a request once a service worker is
  // handling the page's fetches. Quill's worker only caches logos and
  // favicons, so blocking it changes nothing this test is about.
  test.use({ serviceWorkers: "block" });

  test("still opens when clicked, once the connection is back", async ({
    page,
  }) => {
    let connectionDown = true;
    let failed = 0;
    await page.route(ADMIN_CHUNK, (route) => {
      if (!connectionDown) return route.continue();
      failed += 1;
      // Playwright's own spelling.
      // cspell:disable-next-line
      return route.fulfill({ status: 503, body: "" });
    });

    // The seeded user administers, so the admin code is fetched in the
    // background from the teaching dashboard, and here it fails.
    await page.goto("/teaching");
    await expect.poll(() => failed, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/teaching$/);

    // Lost by any reload, so its survival is the proof there was none.
    await page.evaluate(() => {
      (window as MarkedWindow).quillNotReloaded = true;
    });

    connectionDown = false;
    await page.getByRole("complementary").getByText("Admin").click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { name: "Administration" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("error-boundary-fallback")).toHaveCount(0);

    // No reload: the page that was there when the fetch failed is the
    // page that opened Admin.
    expect(
      await page.evaluate(
        () => (window as MarkedWindow).quillNotReloaded === true,
      ),
    ).toBe(true);
  });
});
