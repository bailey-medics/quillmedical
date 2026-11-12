// frontend/scripts/brandSplash.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** A brand's own tab icon, web app manifest and status bar colour. */
export interface BrandIcons {
  favicon: string;
  apple_touch_icon: string;
  manifest: string;
  theme_colour: string;
}

/**
 * What index.html needs to know about the brand it is built as: what to
 * call the tab, the brand's own spinner in place of the quill, and its own
 * icons in place of Quill's, if any.
 */
export interface SplashBrand {
  /** The brand's full name, for the page title. */
  name: string;
  /** The brand's own spinner. Unset for a brand that keeps the quill. */
  spinner: { src: string; still: string } | undefined;
  /** The brand's own icons. Unset for a brand that keeps Quill's. */
  icons: BrandIcons | undefined;
}

/** The part of src/generated/brand.json this reads. */
interface BrandFile {
  identity: { name: string };
  app_themes: Record<
    string,
    {
      identity: { name: string };
      spinner?: { src: string; still: string };
      icons?: BrandIcons;
    }
  >;
}

/** The splash spinner's markers in index.html. */
export const SPLASH_START = "<!-- brand-splash:start -->";
export const SPLASH_END = "<!-- brand-splash:end -->";

const QUILL_TITLE = "<title>Quill Medical</title>";

/** Quill's icon, manifest and status bar colour, as index.html links them. */
const QUILL_FAVICON =
  '<link rel="icon" type="image/x-icon" href="favicon.ico?v=2" />';
const QUILL_MANIFEST = '<link rel="manifest" href="/manifest.webmanifest" />';
const QUILL_THEME_COLOUR = '<meta name="theme-color" content="#0f172a" />';

/**
 * The brand called *name*, from the generated brand file. Unset or empty
 * is Quill, as `resolveAppBrand` in src/theme.ts has it.
 *
 * @throws Error if *name* is set and is not a brand.
 */
export function splashBrand(
  file: BrandFile,
  name: string | undefined,
): SplashBrand {
  if (!name || name === "quill") {
    return { name: file.identity.name, spinner: undefined, icons: undefined };
  }

  if (!Object.hasOwn(file.app_themes, name)) {
    throw new Error(`VITE_BRAND is "${name}", which is not a brand`);
  }

  const theme = file.app_themes[name];

  return {
    name: theme.identity.name,
    spinner: theme.spinner,
    icons: theme.icons,
  };
}

function escaped(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * The brand's own spinner, as the splash. It is the React spinner's
 * picture, written out for a page where none of the app has loaded: the
 * animation, and its still first frame faded in and out for somebody who
 * has asked for less motion. The browser shares one image's animation
 * between the places it shows, so the React spinner that takes over
 * carries on without a jump.
 */
function spinnerSplash(spinner: { src: string; still: string }): string {
  return `<style>
          .quill-splash-brand {
            display: block;
            width: 100%;
            height: 100%;
          }
          .quill-splash-brand picture,
          .quill-splash-brand img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          @media (prefers-reduced-motion: reduce) {
            .quill-splash-brand {
              animation: quill-splash-pulse 1.6s ease-in-out infinite;
            }
          }
        </style>
        <div class="quill-splash-brand" aria-hidden="true">
          <picture>
            <source
              media="(prefers-reduced-motion: reduce)"
              srcset="${escaped(spinner.still)}"
            />
            <img src="${escaped(spinner.src)}" alt="" />
          </picture>
        </div>`;
}

/**
 * Quill's icon, manifest and status bar colour swapped for the brand's.
 *
 * @throws Error if any of the three is not in *html* as Quill writes it,
 *     rather than build a page that quietly keeps Quill's.
 */
function withIcons(html: string, icons: BrandIcons): string {
  for (const tag of [QUILL_FAVICON, QUILL_MANIFEST, QUILL_THEME_COLOUR]) {
    if (!html.includes(tag)) {
      throw new Error(`index.html has no ${tag} to swap for the brand's`);
    }
  }

  return html
    .replace(
      QUILL_FAVICON,
      // With the touch icon beside it: index.html links none for Quill, so
      // an iPhone asks for /apple-touch-icon.png at the root, Quill's.
      `<link rel="icon" type="image/x-icon" href="${escaped(icons.favicon)}" />\n` +
        `    <link rel="apple-touch-icon" href="${escaped(icons.apple_touch_icon)}" />`,
    )
    .replace(
      QUILL_MANIFEST,
      `<link rel="manifest" href="${escaped(icons.manifest)}" />`,
    )
    .replace(
      QUILL_THEME_COLOUR,
      `<meta name="theme-color" content="${escaped(icons.theme_colour)}" />`,
    );
}

/**
 * index.html as the brand would have it: the brand's name as the title,
 * its own spinner in place of the quill, and its own icons in place of
 * Quill's. Quill's comes back as it was written.
 *
 * @throws Error if the title, the splash markers or an icon's tag are not
 *     in *html*, rather than build a page that quietly shows Quill's.
 */
export function brandSplashHtml(html: string, brand: SplashBrand): string {
  if (!html.includes(QUILL_TITLE)) {
    throw new Error(`index.html has no ${QUILL_TITLE} to rename`);
  }

  const start = html.indexOf(SPLASH_START);
  const end = html.indexOf(SPLASH_END);

  if (start === -1 || end < start) {
    throw new Error("index.html has lost its brand-splash markers");
  }

  let branded = html.replace(
    QUILL_TITLE,
    `<title>${escaped(brand.name)}</title>`,
  );

  if (brand.spinner !== undefined) {
    branded =
      branded.slice(0, branded.indexOf(SPLASH_START) + SPLASH_START.length) +
      "\n        " +
      spinnerSplash(brand.spinner) +
      "\n        " +
      branded.slice(branded.indexOf(SPLASH_END));
  }

  if (brand.icons !== undefined) {
    branded = withIcons(branded, brand.icons);
  }

  return branded;
}

/**
 * Brands *indexHtml* for the build's `VITE_BRAND`, in dev and in the
 * build, so the page shows the brand from its first paint and not the
 * quill until the app arrives. Any other page Vite serves, such as
 * Storybook's, which builds from the same config, is left alone.
 */
export function brandSplash(
  indexHtml: string,
  brandJson: string,
  name: string | undefined,
): Plugin {
  const brand = splashBrand(
    JSON.parse(readFileSync(brandJson, "utf8")) as BrandFile,
    name,
  );

  return {
    name: "brand-splash",
    transformIndexHtml: {
      // First, so the page is as written. The dev server rewrites a
      // relative link for a deeper address, `favicon.ico?v=2` becoming
      // `/favicon.ico?v=2` on /safety/…, and run after that the swap
      // found no tag it knew and refused every page but the root.
      order: "pre",
      handler(html, context) {
        if (path.resolve(context.filename) !== path.resolve(indexHtml)) {
          return html;
        }

        return brandSplashHtml(html, brand);
      },
    },
  };
}
