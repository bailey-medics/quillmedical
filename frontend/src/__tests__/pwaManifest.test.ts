// Guards the iOS standalone-mode fix in
// docs/docs/plans/2026-08-16-ios-pwa-standalone-brief.md: the manifest's
// start_url/scope must match the SPA's actual root ("/"), and the manifest
// link tag must be root-relative so it resolves correctly from any page.
//
// Also guards the app icons. macOS draws its own rounded tile behind every
// dock icon, so an icon with a frame drawn into it shows a box inside a box.
// The icons must be opaque full-bleed squares, with maskable variants the OS
// may crop to its own shape.

import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const manifest = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../public/manifest.webmanifest"),
    "utf-8",
  ),
);
const publicDir = path.resolve(__dirname, "../../public");

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

const icons: ManifestIcon[] = manifest.icons;

/** Width, height and colour type from a PNG's header chunk. */
function readPngHeader(file: string): {
  width: number;
  height: number;
  colourType: number;
} {
  const bytes = fs.readFileSync(path.join(publicDir, file));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    colourType: bytes.readUInt8(25),
  };
}

// PNG colour types 2 (RGB) and 0 (greyscale) carry no alpha channel.
const OPAQUE_COLOUR_TYPES = [0, 2];

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

describe("PWA manifest icons", () => {
  it("offers both any and maskable icons at 192 and 512", () => {
    for (const purpose of ["any", "maskable"]) {
      const sizes = icons
        .filter((icon) => icon.purpose === purpose)
        .map((icon) => icon.sizes)
        .sort();
      expect(sizes).toEqual(["192x192", "512x512"]);
    }
  });

  it.each(icons.map((icon) => [icon.src, icon] as const))(
    "%s exists at its declared size and is opaque",
    (_src, icon) => {
      const header = readPngHeader(icon.src);
      expect(`${header.width}x${header.height}`).toBe(icon.sizes);
      expect(OPAQUE_COLOUR_TYPES).toContain(header.colourType);
    },
  );

  it("has an opaque 180x180 apple-touch-icon", () => {
    const header = readPngHeader("apple-touch-icon.png");
    expect(header.width).toBe(180);
    expect(header.height).toBe(180);
    expect(OPAQUE_COLOUR_TYPES).toContain(header.colourType);
  });
});

describe("index.html PWA head tags", () => {
  it("links the apple-touch-icon with a root-relative href", () => {
    expect(indexHtml).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    );
  });

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
