/**
 * The spinner in `index.html` is a copy, by hand, of `QuillSpinner` and
 * `PageSpinner`: it shows before any of the app has loaded, so nothing of
 * the app can draw it. React then replaces it with the real thing, and
 * anything that differs between the two shows as a jump. These tests read
 * both as text and fail when they have drifted apart.
 */

import { describe, expect, it } from "vitest";
import brand from "@/generated/brand.json";
import indexHtml from "../../../index.html?raw";
import pageSpinnerSource from "./PageSpinner.tsx?raw";
import { QUILL_OUTLINE } from "./quillOutline";
import stylesheet from "./QuillSpinner.module.css?raw";

const DARK = '[data-mantine-color-scheme="dark"]';
const COLOURS = ["face", "lit", "shadow"] as const;

/** Everything between the braces that follow `opening`, braces matched. */
function block(css: string, opening: string): string {
  const start = css.indexOf(opening);
  if (start === -1) throw new Error(`No "${opening}" in the stylesheet`);

  const from = css.indexOf("{", start) + 1;
  let depth = 1;
  let at = from;

  while (depth > 0 && at < css.length) {
    if (css[at] === "{") depth += 1;
    if (css[at] === "}") depth -= 1;
    at += 1;
  }

  return css.slice(from, at - 1);
}

function squashed(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

/** A colour as written, or the palette shade a theme variable names. */
function resolved(value: string): string {
  const shade = /^var\(--mantine-color-primary-(\d)\)$/.exec(value);
  if (shade === null) return value;

  const colour = brand.palette.primary[Number(shade[1])];
  if (colour === undefined) throw new Error(`No primary shade ${shade[1]}`);

  return colour;
}

function colour(rules: string, name: (typeof COLOURS)[number]): string {
  const found = new RegExp(`--quill-spinner-${name}:\\s*([^;]+);`).exec(rules);
  if (found?.[1] === undefined) throw new Error(`No ${name} colour`);

  return resolved(found[1].trim());
}

/** The text between two markers, neither included. */
function between(text: string, from: string, to: string): string {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  if (start === -1 || end === -1) throw new Error(`No "${from}" to "${to}"`);

  return text.slice(start + from.length, end);
}

const splash = between(indexHtml, '<div id="root">', '<script type="module"');
const splashStyles = between(splash, "<style>", "</style>");

describe("the start-up spinner in index.html", () => {
  it("sits inside the root, where React's first render replaces it", () => {
    expect(indexHtml).toMatch(
      /<div id="root">[\s\S]*class="quill-splash"[\s\S]*<\/div>\s*<script type="module"/,
    );
  });

  // The content security policy runs no script written inside the page,
  // so a splash that needed one would be a splash only in development.
  it("needs no script", () => {
    expect(splash).not.toMatch(/<script/);
  });

  it("draws the same feather as QuillSpinner, once, and shows it thrice", () => {
    expect(splash.match(/ d="/g)).toHaveLength(1);
    expect(splash).toContain(`d="${QUILL_OUTLINE}"`);
    expect(splash.match(/<use href="#quill-splash-outline"/g)).toHaveLength(2);
  });

  it("tells screen readers it is loading", () => {
    expect(splash).toMatch(/role="status"\s*>\s*Loading\s*</);
    expect(splash).toMatch(/class="quill-splash-tilt"\s+aria-hidden="true"/);
  });

  it.each(["turn", "lit", "shadow", "lit-late", "shadow-late", "pulse"])(
    "moves as QuillSpinner does: %s",
    (name) => {
      expect(
        squashed(block(splashStyles, `@keyframes quill-splash-${name} `)),
      ).toBe(squashed(block(stylesheet, `@keyframes ${name} `)));
    },
  );

  it.each([
    "--quill-spinner-turn: 2.4s;",
    "--quill-spinner-half-turn: calc(var(--quill-spinner-turn) / 2);",
    "transform-origin: 19.918% 97.036%;",
    "transform: rotate(32.59deg);",
  ])("turns at the same speed, about the same point: %s", (declaration) => {
    expect(squashed(stylesheet)).toContain(declaration);
    expect(squashed(splashStyles)).toContain(declaration);
  });

  it.each(COLOURS)("has QuillSpinner's %s colour in light mode", (name) => {
    expect(colour(block(splashStyles, ".quill-splash {"), name)).toBe(
      colour(block(stylesheet, ".spinner {"), name),
    );
  });

  it.each(COLOURS)("has QuillSpinner's %s colour in dark mode", (name) => {
    expect(colour(block(splashStyles, `${DARK} .quill-splash {`), name)).toBe(
      colour(block(stylesheet, `:global(${DARK}) .spinner {`), name),
    );
  });

  it("uses the later fades in dark mode, as QuillSpinner does", () => {
    for (const name of ["lit", "shadow"]) {
      expect(squashed(block(stylesheet, `:global(${DARK}) .${name} {`))).toBe(
        `animation-name: ${name}-late;`,
      );
      expect(
        squashed(block(splashStyles, `${DARK} .quill-splash-${name} {`)),
      ).toBe(`animation-name: quill-splash-${name}-late;`);
    }
  });

  it("stops the spin for somebody who has asked for less motion", () => {
    const reducedMotion = block(
      splashStyles,
      "@media (prefers-reduced-motion: reduce)",
    );

    expect(squashed(reducedMotion)).toMatch(
      /\.quill-splash-spin,.*\.quill-splash-shadow \{ animation: none; \}/,
    );
  });

  it("is the size and in the place PageSpinner puts the quill", () => {
    expect(pageSpinnerSource).toContain('mih="60dvh"');
    expect(pageSpinnerSource).toContain('size="8rem"');
    expect(squashed(block(splashStyles, ".quill-splash {"))).toContain(
      "display: flex; align-items: center; justify-content: center; min-height: 60dvh;",
    );
    expect(squashed(block(splashStyles, ".quill-splash-box {"))).toBe(
      "width: 8rem; height: 8rem;",
    );
  });

  // Mantine's own stylesheet paints a dark page grey until the theme
  // loads. The splash's colours are chosen for navy.
  it("makes a dark page navy from the first paint", () => {
    expect(squashed(block(splashStyles, `:root${DARK} {`))).toBe(
      `--mantine-color-body: ${brand.palette.primary[8]};`,
    );
  });
});
