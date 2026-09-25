import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import meta from "../page-meta.json";

const require = createRequire(import.meta.url);
const { headFor } = require("./generate-pages.cjs") as {
  headFor: (
    name: string,
    meta: Record<string, { title: string; description: string }>,
  ) => { title: string; description: string };
};

const pagesDir = path.resolve(__dirname, "../src/pages");
const pages = readdirSync(pagesDir)
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => file.replace(/\.tsx$/, ""));

describe("page-meta.json", () => {
  it.each(pages)("has a title and description for %s", (page) => {
    const entry = meta[page as keyof typeof meta];
    expect(entry?.title).toBeTruthy();
    expect(entry?.description).toBeTruthy();
  });

  it("has no entry for a page that does not exist", () => {
    expect(Object.keys(meta).filter((name) => !pages.includes(name))).toEqual(
      [],
    );
  });

  it.each(Object.entries(meta))(
    "keeps %s's description short enough for a search result",
    (_name, entry) => {
      expect(entry.description.length).toBeLessThanOrEqual(160);
    },
  );
});

describe("headFor", () => {
  it("puts the page first and the site name last", () => {
    expect(headFor("pricing", meta).title).toBe("Pricing – Quill Medical");
  });

  it("uses the site name alone for the home page", () => {
    expect(headFor("index", meta).title).toBe("Quill Medical");
  });

  it("escapes HTML in the title and description", () => {
    const head = headFor("x", {
      x: { title: "A & B", description: 'Say "hi" <b>' },
    });
    expect(head.title).toBe("A &amp; B – Quill Medical");
    expect(head.description).toBe("Say &quot;hi&quot; &lt;b&gt;");
  });

  it("refuses a page with no entry rather than inventing a title", () => {
    expect(() => headFor("missing", meta)).toThrow(/missing/);
  });
});
