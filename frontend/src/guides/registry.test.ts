/**
 * The registry and the markdown files say the same thing.
 */

import { describe, expect, it } from "vitest";
import { CONTENT_SLUGS, guideBody, guideHeading, guideImages } from "./content";
import { findGuide, GUIDES } from "./registry";

describe("the guide registry", () => {
  it("has a markdown file for every entry and an entry for every file", () => {
    expect(GUIDES.map((guide) => guide.slug).sort()).toEqual(CONTENT_SLUGS);
  });

  it("gives no two guides the same slug", () => {
    const slugs = GUIDES.map((guide) => guide.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(GUIDES)("titles $slug as its file's heading does", (guide) => {
    expect(guideHeading(guide.slug)).toBe(guide.title);
  });

  it.each(GUIDES)("keeps $slug's heading out of its body", (guide) => {
    const body = guideBody(guide.slug);

    expect(body).toBeTruthy();
    expect(body).not.toMatch(/^# /m);
  });

  it.each(GUIDES)(
    "uses a slug for $slug that is safe in an address",
    (guide) => {
      expect(guide.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    },
  );

  it("finds a guide by its slug, and nothing for an unknown one", () => {
    expect(findGuide(GUIDES[0].slug)).toBe(GUIDES[0]);
    expect(findGuide("no-such-guide")).toBeUndefined();
    expect(findGuide(undefined)).toBeUndefined();
  });

  it("has no words for a slug with no file", () => {
    expect(guideBody("no-such-guide")).toBeUndefined();
    expect(guideHeading("no-such-guide")).toBeUndefined();
  });

  // `MarkdownView` leaves out an image that breaks either rule, silently.
  // Said here instead, where it fails the build.
  describe.each(GUIDES)("the images of $slug", (guide) => {
    const images = guideImages(guide.slug);

    it("all have alt text", () => {
      expect(images.filter((image) => image.alt === "")).toEqual([]);
    });

    it("all live in the guide's own folder", () => {
      const own = new RegExp(`^${guide.slug}/[a-z0-9-]+\\.png$`);

      expect(images.filter((image) => !own.test(image.path))).toEqual([]);
    });
  });
});
