// frontend/scripts/chunkSizes.test.ts

import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { gzipSync } from "zlib";
import { formatChunkReport, measureChunks } from "./chunkSizes";

function makeBuild(indexHtml: string, assets: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chunk-sizes-test-"));
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "index.html"), indexHtml);
  for (const [file, contents] of Object.entries(assets)) {
    fs.writeFileSync(path.join(dir, "assets", file), contents);
  }
  return dir;
}

const ENTRY = "console.log('entry');".repeat(50);
const ADMIN = "console.log('admin');".repeat(20);
const TEACHING = "console.log('teaching');".repeat(40);

describe("measureChunks", () => {
  it("reports the raw and gzipped size of each file", () => {
    const dir = makeBuild("", { "admin-abc.js": ADMIN });

    expect(measureChunks(dir)).toEqual([
      {
        file: "admin-abc.js",
        rawBytes: ADMIN.length,
        gzipBytes: gzipSync(ADMIN).length,
        firstLoad: false,
      },
    ]);
  });

  it("marks a file index.html references as first load", () => {
    const dir = makeBuild(
      '<script type="module" src="/assets/index-123.js"></script>',
      { "index-123.js": ENTRY, "admin-abc.js": ADMIN },
    );

    const byFile = Object.fromEntries(
      measureChunks(dir).map((chunk) => [chunk.file, chunk.firstLoad]),
    );

    expect(byFile).toEqual({ "index-123.js": true, "admin-abc.js": false });
  });

  it("lists first-load files first, then the rest largest first", () => {
    const dir = makeBuild('<link href="/assets/index-123.css">', {
      "admin-abc.js": ADMIN,
      "teaching-def.js": TEACHING,
      "index-123.css": "a{}",
    });

    expect(measureChunks(dir).map((chunk) => chunk.file)).toEqual([
      "index-123.css",
      "teaching-def.js",
      "admin-abc.js",
    ]);
  });

  it("ignores files that are neither JavaScript nor CSS", () => {
    const dir = makeBuild("", {
      "logo-abc.png": "not really a png",
      "admin-abc.js": ADMIN,
      "admin-abc.js.map": "{}",
    });

    expect(measureChunks(dir).map((chunk) => chunk.file)).toEqual([
      "admin-abc.js",
    ]);
  });

  it("refuses a directory that holds no build", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chunk-sizes-test-"));

    expect(() => measureChunks(dir)).toThrow(/No build found/);
  });
});

describe("formatChunkReport", () => {
  it("separates first load from on demand, with a count and a total", () => {
    const report = formatChunkReport([
      { file: "index.js", rawBytes: 3000, gzipBytes: 1000, firstLoad: true },
      { file: "admin.js", rawBytes: 2000, gzipBytes: 500, firstLoad: false },
      { file: "teach.js", rawBytes: 1000, gzipBytes: 250, firstLoad: false },
    ]);

    const lines = report.split("\n");
    expect(lines[0]).toBe("First load, referenced by index.html (1 files)");
    expect(lines).toContain(
      "On demand, not referenced by index.html (2 files)",
    );
    expect(lines.at(-1)).toMatch(/total\s+3\.00\s+0\.75$/);
    expect(report).toMatch(/index\.js\s+3\.00\s+1\.00/);
  });

  it("copes with a build that has nothing on demand", () => {
    const report = formatChunkReport([
      { file: "index.js", rawBytes: 3000, gzipBytes: 1000, firstLoad: true },
    ]);

    expect(report).toContain("not referenced by index.html (0 files)");
  });
});
