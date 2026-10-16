/**
 * The public site, quill-medical.com, as the end-to-end stack serves it.
 *
 * Production serves the public site from Cloud Storage and the app from
 * app.quill-medical.com. The stack serves both, on two ports: the app at
 * the base URL, and the public site at `E2E_PUBLIC_URL`, which `just e2e`
 * sets and CI leaves at its default of port 8081.
 *
 * The public site is a separate build with no access to the app's routes,
 * so its buttons name the live app in full. `followIntoTheStack` sends a
 * browser that clicks one to the same path on the stack instead, so a test
 * follows the real button and never leaves the machine.
 */

import type { BrowserContext } from "@playwright/test";

/** The live app's address, as the public site's buttons write it. */
export const LIVE_APP = "https://app.quill-medical.com";

/** Where the stack serves the public site. */
export const PUBLIC_SITE =
  process.env.E2E_PUBLIC_URL ?? "http://localhost:8081";

/** Where the stack serves the app. */
const APP = process.env.E2E_BASE_URL ?? "http://localhost";

/**
 * Answer every request for the live app with a page that moves on to the
 * same path on the stack.
 *
 * The request never reaches the live app: Playwright answers it in the
 * browser. A page that refreshes itself rather than a 302, because WebKit
 * will not let a route be answered with a redirect.
 */
export async function followIntoTheStack(
  context: BrowserContext,
): Promise<void> {
  await context.route(`${LIVE_APP}/**`, async (route) => {
    const url = new URL(route.request().url());
    const target = `${APP}${url.pathname}${url.search}`;

    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<meta http-equiv="refresh" content="0;url=${target}">`,
    });
  });
}
