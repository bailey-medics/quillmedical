/**
 * The colour scheme is set before the app starts.
 *
 * Somebody who chose dark should not see a light page flash while the
 * app loads, so a small script in index.html sets the scheme first. It
 * was written inside the page, and the production content security
 * policy (caddy/prod/Caddyfile) runs no script written inside a page,
 * so in production it never ran. Dev has no such policy, which is why
 * nobody saw it. This stack serves the app through that policy.
 */

import { expect, test, type Page } from "@playwright/test";

interface PolicyWindow {
  policyRefusals: string[];
}

/**
 * Opens the app with `scheme` saved as the person's choice, and with
 * the app's own code kept from loading, so only the early script can
 * have set anything.
 */
async function openBeforeTheAppStarts(
  page: Page,
  scheme: string | null,
): Promise<void> {
  await page.addInitScript((saved) => {
    const refusals: string[] = [];
    (window as unknown as PolicyWindow).policyRefusals = refusals;
    document.addEventListener("securitypolicyviolation", (event) => {
      refusals.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    if (saved === null) {
      localStorage.removeItem("mantine-color-scheme-value");
    } else {
      localStorage.setItem("mantine-color-scheme-value", saved);
    }
  }, scheme);
  await page.route("**/assets/**", (route) => route.abort());

  await page.goto("/");
}

test.describe("The colour scheme, before the app starts", () => {
  // A service worker would serve the app's code itself, past the route
  // above that holds it back.
  test.use({ serviceWorkers: "block" });

  test("a saved choice of dark is applied", async ({ page }) => {
    await openBeforeTheAppStarts(page, "dark");

    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );
  });

  test("with nothing saved, the page is light", async ({ page }) => {
    await openBeforeTheAppStarts(page, null);

    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "light",
    );
  });

  test("the policy refuses nothing on the way", async ({ page }) => {
    await openBeforeTheAppStarts(page, "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-mantine-color-scheme",
      "dark",
    );

    expect(
      await page.evaluate(
        () => (window as unknown as PolicyWindow).policyRefusals,
      ),
    ).toEqual([]);
  });
});
