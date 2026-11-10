// frontend/scripts/brandSplash.test.ts

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import brandFile from "../src/generated/brand.json";
import {
  brandSplash,
  brandSplashHtml,
  SPLASH_END,
  SPLASH_START,
  splashBrand,
} from "./brandSplash";

const frontend = path.resolve(__dirname, "..");
const indexPath = path.join(frontend, "index.html");
const brandPath = path.join(frontend, "src/generated/brand.json");
const indexHtml = readFileSync(indexPath, "utf8");

function between(html: string): string {
  return html.slice(html.indexOf(SPLASH_START), html.indexOf(SPLASH_END));
}

describe("splashBrand", () => {
  it.each([undefined, "", "quill"])(
    "is Quill for %j, with no spinner of its own",
    (name) => {
      expect(splashBrand(brandFile, name)).toEqual({
        name: "Quill Medical",
        spinner: undefined,
        icons: undefined,
      });
    },
  );

  it("is Let's Do Digital's name, turning logo and icons for ldd", () => {
    expect(splashBrand(brandFile, "ldd")).toEqual({
      name: "Let's Do Digital",
      spinner: {
        src: "/brands/ldd/logo-spinner.webp",
        still: "/brands/ldd/logo-spinner-still.png",
      },
      icons: {
        favicon: "/brands/ldd/favicon.ico",
        apple_touch_icon: "/brands/ldd/apple-touch-icon.png",
        manifest: "/brands/ldd/manifest.webmanifest",
        theme_colour: "#0848a9",
      },
    });
  });

  it("refuses a brand that does not exist", () => {
    expect(() => splashBrand(brandFile, "nobody")).toThrow(/not a brand/);
  });
});

describe("index.html built as Quill", () => {
  it("comes back exactly as it was written", () => {
    const quill = splashBrand(brandFile, "quill");

    expect(brandSplashHtml(indexHtml, quill)).toBe(indexHtml);
  });

  it("keeps the quill between the markers", () => {
    expect(between(indexHtml)).toContain("quill-splash-tilt");
  });
});

describe("index.html built as Let's Do Digital", () => {
  const ldd = brandSplashHtml(indexHtml, splashBrand(brandFile, "ldd"));

  it("shows Let's Do Digital's turning logo in place of the quill", () => {
    const splash = between(ldd);

    expect(splash).toMatch(/<img src="\/brands\/ldd\/logo-spinner\.webp"/);
    expect(splash).not.toContain("<svg");
    expect(splash).not.toContain("quill-splash-tilt");
  });

  it("shows the still frame, fading, for somebody who asked for less motion", () => {
    const splash = between(ldd);

    expect(splash).toMatch(
      /<source\s+media="\(prefers-reduced-motion: reduce\)"\s+srcset="\/brands\/ldd\/logo-spinner-still\.png"/,
    );
    expect(splash).toMatch(
      /prefers-reduced-motion: reduce\)\s*{\s*\.quill-splash-brand\s*{\s*animation: quill-splash-pulse/,
    );
  });

  it("hides the spinner from screen readers, which still hear Loading", () => {
    expect(ldd).toMatch(/class="quill-splash-brand" aria-hidden="true"/);
    expect(ldd).toMatch(/<img[^>]*alt=""/);
    expect(ldd).toContain('role="status">Loading</span>');
  });

  it("calls the tab Let's Do Digital", () => {
    expect(ldd).toContain("<title>Let's Do Digital</title>");
    expect(ldd).not.toContain("<title>Quill Medical</title>");
  });

  it("gives the tab Let's Do Digital's icon, not the quill", () => {
    expect(ldd).toContain(
      '<link rel="icon" type="image/x-icon" href="/brands/ldd/favicon.ico" />',
    );
    expect(ldd).not.toContain('href="favicon.ico?v=2"');
  });

  it("gives an iPhone's home screen Let's Do Digital's icon, not the root's quill", () => {
    expect(ldd).toContain(
      '<link rel="apple-touch-icon" href="/brands/ldd/apple-touch-icon.png" />',
    );
  });

  it("links Let's Do Digital's manifest, so an installed app is called Let's Do Digital", () => {
    expect(ldd).toContain(
      '<link rel="manifest" href="/brands/ldd/manifest.webmanifest" />',
    );
    expect(ldd).not.toContain('href="/manifest.webmanifest"');
  });

  it("gives a phone's status bar Let's Do Digital's blue", () => {
    expect(ldd).toContain('<meta name="theme-color" content="#0848a9" />');
  });
});

describe("Let's Do Digital's manifest and icons, in public/", () => {
  const manifest = JSON.parse(
    readFileSync(
      path.join(frontend, "public/brands/ldd/manifest.webmanifest"),
      "utf8",
    ),
  ) as { name: string; theme_color: string; icons: { src: string }[] };

  it("names the app Let's Do Digital, in Let's Do Digital's colour", () => {
    expect(manifest.name).toBe("Let's Do Digital");
    expect(manifest.theme_color).toBe("#0848a9");
  });

  it("names only icons that are there", () => {
    for (const icon of manifest.icons) {
      expect(existsSync(path.join(frontend, "public", icon.src))).toBe(true);
    }
  });

  it.each(["favicon.ico", "apple-touch-icon.png"])(
    "has the %s the page links",
    (name) => {
      expect(existsSync(path.join(frontend, "public/brands/ldd", name))).toBe(
        true,
      );
    },
  );
});

describe("brandSplashHtml", () => {
  const ldd = splashBrand(brandFile, "ldd");

  it("refuses a page that has lost its markers, rather than show the quill", () => {
    const lost = indexHtml.replace(SPLASH_START, "");

    expect(() => brandSplashHtml(lost, ldd)).toThrow(/markers/);
  });

  it("refuses a page whose icon it cannot find, rather than keep the quill's", () => {
    const lost = indexHtml.replace(/<link rel="icon"[^>]*>/, "");

    expect(() => brandSplashHtml(lost, ldd)).toThrow(/rel="icon"/);
  });

  it("refuses a page whose title it cannot find", () => {
    const retitled = indexHtml.replace("<title>Quill Medical</title>", "");

    expect(() => brandSplashHtml(retitled, ldd)).toThrow(/title/);
  });
});

describe("the brand-splash plugin", () => {
  type Hook = (html: string, context: { filename: string }) => string;
  type OrderedHook = { order?: string; handler: Hook };

  function hookObject(name: string): OrderedHook {
    const plugin = brandSplash(indexPath, brandPath, name);

    return plugin.transformIndexHtml as unknown as OrderedHook;
  }

  function hook(name: string): Hook {
    return hookObject(name).handler;
  }

  // On a deeper address the dev server rewrote `favicon.ico?v=2` to
  // `/favicon.ico?v=2` before a hook of the usual order saw the page, and
  // the swap refused every page but the root.
  it("runs before Vite rewrites the page's links", () => {
    expect(hookObject("ldd").order).toBe("pre");
  });

  it("brands the app's own index.html", () => {
    const html = hook("ldd")(indexHtml, { filename: indexPath });

    expect(html).toContain("<title>Let's Do Digital</title>");
  });

  // Storybook builds from the same Vite config, and its page has no
  // markers to find.
  it("leaves any other page Vite serves alone", () => {
    const other = "<html><title>Storybook</title></html>";
    const html = hook("ldd")(other, {
      filename: path.join(frontend, ".storybook/iframe.html"),
    });

    expect(html).toBe(other);
  });
});
