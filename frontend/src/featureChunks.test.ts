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
  {
    name: "clinical",
    loader: "loadClinical",
    file: "pages/clinical/clinicalChunk.ts",
  },
] as const;

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
