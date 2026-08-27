// Guards the iOS standalone-mode fix in
// docs/docs/plans/2026-08-16-ios-pwa-standalone-brief.md: the manifest's
// start_url/scope must match the SPA's actual root ("/"), and the manifest
// link tag must be root-relative so it resolves correctly from any page.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const manifest = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../public/manifest.webmanifest"),
    "utf-8",
  ),
);
const indexHtml = fs.readFileSync(
  path.resolve(__dirname, "../../index.html"),
  "utf-8",
);

describe("PWA manifest", () => {
  it("has start_url and scope matching the SPA root", () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  it("requests standalone display", () => {
    expect(manifest.display).toBe("standalone");
  });
});

describe("index.html PWA head tags", () => {
  it("links the manifest with a root-relative href", () => {
    expect(indexHtml).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
  });

  it("declares iOS standalone-mode capability meta tags", () => {
    expect(indexHtml).toContain(
      '<meta name="apple-mobile-web-app-capable" content="yes" />',
    );
    expect(indexHtml).toContain(
      '<meta name="mobile-web-app-capable" content="yes" />',
    );
  });
});
