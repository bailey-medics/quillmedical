/**
 * Every screenshot a guide names is taken, and every one taken is named.
 *
 * The two halves live apart: a guide's markdown names its images, and a
 * Playwright spec in `e2e/guides/` takes them with `shot(page, "…")`.
 * Nothing else connects them, so without this a renamed step leaves a
 * guide pointing at a picture that is never made, or a spec making one
 * that is never shown.
 */

import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { guideImages } from "./content";
import { GUIDES } from "./registry";

const SPEC_DIR = path.join(__dirname, "..", "..", "e2e", "guides");

/** The images one guide's spec takes, read from its `shot` calls. */
function shotsTakenFor(slug: string): string[] {
  const spec = path.join(SPEC_DIR, `${slug}.spec.ts`);
  if (!fs.existsSync(spec)) return [];
  const source = fs.readFileSync(spec, "utf8");
  return [...source.matchAll(/shot\(\s*page,\s*"([^"]+)"/g)]
    .map((match) => `${match[1]}.png`)
    .sort();
}

describe.each(GUIDES)("the screenshots of $slug", (guide) => {
  it("are the ones its spec takes, no more and no fewer", () => {
    const named = guideImages(guide.slug)
      .map((image) => image.path)
      .sort();

    expect(named).toEqual(shotsTakenFor(guide.slug));
  });
});

it("has no spec for a guide that does not exist", () => {
  const slugs: string[] = GUIDES.map((guide) => guide.slug);
  const specs = fs
    .readdirSync(SPEC_DIR)
    .filter((file) => file.endsWith(".spec.ts"))
    .map((file) => file.replace(/\.spec\.ts$/, ""));

  expect(specs.filter((spec) => !slugs.includes(spec))).toEqual([]);
});
