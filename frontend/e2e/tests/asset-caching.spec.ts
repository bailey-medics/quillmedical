/**
 * What the production server tells a browser about keeping the app's files.
 *
 * The build names each file after a hash of its contents, so a name never
 * changes meaning and the browser can keep the file for a year without
 * asking again. `index.html` has a fixed name and must always be checked,
 * or nobody would ever see a new version.
 *
 * The rule lives in caddy/prod/Caddyfile, which this stack serves the app
 * through. It once matched a file name shape the build does not produce,
 * so no app code was sent with a cache lifetime at all, and nothing said
 * so.
 */

import { expect, test } from "@playwright/test";

const KEEP_FOR_A_YEAR = "public, max-age=31536000, immutable";

test.describe("Caching of the app's own files", () => {
  test("built JavaScript and CSS may be kept for a year", async ({
    request,
  }) => {
    const html = await (await request.get("/")).text();
    const assets = [
      ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g),
    ].map((match) => match[1] ?? "");

    // The entry script and the stylesheet at the least.
    expect(assets.some((asset) => asset.endsWith(".js"))).toBe(true);
    expect(assets.some((asset) => asset.endsWith(".css"))).toBe(true);

    for (const asset of assets) {
      const response = await request.get(asset);
      expect(response.status(), asset).toBe(200);
      expect(response.headers()["cache-control"], asset).toBe(KEEP_FOR_A_YEAR);
    }
  });

  test("the page itself is always re-checked", async ({ request }) => {
    const response = await request.get("/");

    expect(response.headers()["cache-control"]).toBe("no-cache");
  });

  test("a file with a fixed name is not kept for a year", async ({
    request,
  }) => {
    const response = await request.get("/apple-touch-icon.png");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"] ?? "").not.toContain(
      "immutable",
    );
  });
});
