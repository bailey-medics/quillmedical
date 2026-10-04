import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import * as featureChunks from "./featureChunks";

const mainSource = fs.readFileSync(path.join(__dirname, "main.tsx"), "utf8");

/** The module each `export … from "…"` line of a chunk re-exports. */
function reExportedModules(chunkFile: string): string[] {
  const source = fs.readFileSync(path.join(__dirname, chunkFile), "utf8");
  return [...source.matchAll(/^export .* from "(.+)";$/gm)].map((match) =>
    path.join(path.dirname(chunkFile), match[1] ?? ""),
  );
}

const CHUNKS = [
  { name: "admin", loader: "loadAdmin", file: "pages/admin/adminChunk.ts" },
  {
    name: "clinical",
    loader: "loadClinical",
    file: "pages/clinical/clinicalChunk.ts",
  },
  {
    name: "passport",
    loader: "loadPassport",
    file: "pages/passport/passportChunk.ts",
  },
  { name: "safety", loader: "loadSafety", file: "pages/safety/safetyChunk.ts" },
  {
    name: "teaching",
    loader: "loadTeaching",
    file: "features/teaching/teachingChunk.ts",
  },
] as const;

// The rule the plan sets: a feature is one lazy chunk, never one per page.
// A bare `import()` in a route is a per-page chunk.
it("gives no route in main.tsx a lazy import of its own", () => {
  expect(mainSource).not.toMatch(/lazy:\s*\(\)\s*=>\s*import\(/);
});

describe.each(CHUNKS)("the $name chunk", ({ loader, file }) => {
  it("exports nothing but page components", async () => {
    const chunk: Record<string, unknown> = await featureChunks[loader]();

    expect(Object.keys(chunk).length).toBeGreaterThan(0);
    for (const [name, page] of Object.entries(chunk)) {
      expect(page, name).toBeTypeOf("function");
    }
  });

  // A page main.tsx also imports statically is bundled into first load,
  // and its `lazy` then defers nothing. The build says so only in a
  // warning nobody reads.
  it("holds no page that main.tsx still imports statically", () => {
    const stillStatic = reExportedModules(file).filter((module) =>
      mainSource.includes(`from "./${module}"`),
    );

    expect(stillStatic).toEqual([]);
  });

  it("is loaded by main.tsx only through its loader", () => {
    expect(mainSource).toContain(`lazyFrom(${loader}, `);
    const module = `"./${file.replace(/\.ts$/, "")}"`;
    expect(mainSource).not.toContain(`from ${module}`);
    expect(mainSource).not.toContain(`import(${module})`);
  });
});

// Losing an exam attempt is the one failure here that cannot be put right
// afterwards. The attempt and its result cannot safely reload, so the
// result page must already be in memory when the exam starts: both pages
// in the one teaching chunk, and neither route loading anything else.
describe("the exam", () => {
  it("has the attempt and its result in the same chunk", async () => {
    const chunk = await featureChunks.loadTeaching();

    expect(chunk.AssessmentAttempt).toBeTypeOf("function");
    expect(chunk.AssessmentResultPage).toBeTypeOf("function");
  });

  it.each([
    ["assessment/:id", "AssessmentAttempt"],
    ["assessment/:id/result", "AssessmentResultPage"],
  ])("loads %s from the teaching chunk", (routePath, page) => {
    const route = new RegExp(
      `path: "${routePath}",\\s*lazy: lazyFrom\\(loadTeaching, "${page}"\\)`,
    );

    expect(mainSource).toMatch(route);
  });
});
