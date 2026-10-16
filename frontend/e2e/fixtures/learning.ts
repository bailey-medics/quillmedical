/**
 * The pinned teaching module's learning, read from its own file.
 *
 * `learning/content.mdx` is split into slides as the backend's
 * `parse_mdx_to_slides` splits it: a `#` heading starts a section-title
 * slide, a `##` heading a slide of its own, and what follows a heading,
 * up to the next, is that slide's body. A test then checks each slide
 * shows what its part of the file says, so a slide added to the module
 * is checked as soon as the pin moves, with no change here.
 */

import fs from "node:fs";
import path from "node:path";
import { expect, type Locator } from "@playwright/test";
import { MODULE_ID, squash } from "./answers";

/** The pinned module's learning, from the `frontend` folder tests run in. */
const CONTENT = path.join(
  "..",
  ".e2e-teaching",
  "respiratory-teaching",
  "modules",
  MODULE_ID,
  "learning",
  "content.mdx",
);

/** One slide, as a test checks it. */
export interface KnownSlide {
  title: string;
  /** Each line of text the slide shows, markdown taken off. */
  lines: string[];
  /** The `<YouTube>` or `<Video>` the slide plays, if any. */
  plays: boolean;
  /** The alt text of the `<Figure>` the slide shows, if any. */
  figureAlt: string | null;
}

/** A whole component, opening tag to closing, or one that closes itself. */
const COMPONENT = /<([A-Z]\w*)\b[^>]*\/>|<([A-Z]\w*)\b[^>]*>[\s\S]*?<\/\2>/g;
const CALLOUT = /<Callout\b[^>]*>([\s\S]*?)<\/Callout>/;
const PLAYS = /<(YouTube|Video)\b[^>]*\/>/;
const FIGURE = /<Figure\b([^>]*)\/>/;

/** A line of markdown as the page shows it: no list marker, no emphasis. */
function asShown(line: string): string {
  return squash(
    line
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*\d+\.\s+/, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/(\*\*|__|\*|_|`)/g, ""),
  );
}

/** The lines of text in *body*, each as the page shows it. */
function textLines(body: string): string[] {
  return body
    .split("\n")
    .map(asShown)
    .filter((line) => line.length > 0);
}

/** Every slide of the pinned module's learning, in order. */
export function knownSlides(): KnownSlide[] {
  const content = fs
    .readFileSync(CONTENT, "utf8")
    .replace(/^---\n[\s\S]*?\n---\n/, "");
  const slides: KnownSlide[] = [];
  let title: string | null = null;
  let body: string[] = [];

  const flush = (): void => {
    if (title === null) {
      return;
    }

    const text = body.join("\n");
    const callout = CALLOUT.exec(text)?.[1] ?? "";
    const figure = FIGURE.exec(text)?.[1] ?? null;

    slides.push({
      title,
      lines: [...textLines(text.replace(COMPONENT, "")), ...textLines(callout)],
      plays: PLAYS.test(text),
      figureAlt:
        figure === null ? null : (/alt="([^"]+)"/.exec(figure)?.[1] ?? title),
    });
  };

  for (const line of content.split("\n")) {
    const heading = /^#{1,2}\s(.+)$/.exec(line);

    if (heading) {
      flush();
      title = heading[1].trim();
      body = [];
    } else if (title !== null) {
      body.push(line);
    }
  }
  flush();

  return slides;
}

/**
 * Check a picture has loaded, not merely that an `img` is on the page.
 *
 * A picture whose file is missing still leaves its element, with its alt
 * text, so its being visible proves nothing. One that loaded has a width
 * of its own.
 */
export async function expectLoaded(image: Locator): Promise<void> {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) =>
        element instanceof HTMLImageElement
          ? element.complete && element.naturalWidth > 0
          : false,
      ),
    )
    .toBe(true);
}
