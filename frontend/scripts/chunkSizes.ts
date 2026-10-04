// frontend/scripts/chunkSizes.ts
//
// Reports the size of every JavaScript and CSS file a production build
// wrote to `dist/assets`, and whether `dist/index.html` references it.
// Run by `just frontend-chunks` after `yarn build`.
//
// Code splitting is proved here rather than in a diff. A `lazy` that defers
// nothing reads the same in review as one that works; the difference is
// whether the page's code left the entry chunk, and whether `index.html`
// still asks for it on first load.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { gzipSync } from "zlib";

export interface ChunkSize {
  file: string;
  rawBytes: number;
  gzipBytes: number;
  /** Referenced by index.html, so downloaded on every first load. */
  firstLoad: boolean;
}

const MEASURED_EXTENSIONS = [".js", ".css"];

/**
 * Measures each built asset. First-load files come first, then the rest,
 * largest first within each group.
 */
export function measureChunks(distDir: string): ChunkSize[] {
  const assetsDir = path.join(distDir, "assets");
  const indexPath = path.join(distDir, "index.html");
  if (!fs.existsSync(assetsDir) || !fs.existsSync(indexPath)) {
    throw new Error(
      `No build found in ${distDir}: expected index.html and assets/.`,
    );
  }

  const indexHtml = fs.readFileSync(indexPath, "utf8");

  return fs
    .readdirSync(assetsDir)
    .filter((file) => MEASURED_EXTENSIONS.includes(path.extname(file)))
    .map((file) => {
      const contents = fs.readFileSync(path.join(assetsDir, file));
      return {
        file,
        rawBytes: contents.length,
        gzipBytes: gzipSync(contents).length,
        firstLoad: indexHtml.includes(`assets/${file}`),
      };
    })
    .sort(
      (a, b) =>
        Number(b.firstLoad) - Number(a.firstLoad) ||
        b.gzipBytes - a.gzipBytes ||
        a.file.localeCompare(b.file),
    );
}

// Thousands, not 1024s, to match the figures Vite prints and the ones
// already recorded in the plans.
function kB(bytes: number): string {
  return (bytes / 1000).toFixed(2).padStart(9);
}

function total(chunks: ChunkSize[], key: "rawBytes" | "gzipBytes"): number {
  return chunks.reduce((sum, chunk) => sum + chunk[key], 0);
}

export function formatChunkReport(chunks: ChunkSize[]): string {
  const firstLoad = chunks.filter((chunk) => chunk.firstLoad);
  const onDemand = chunks.filter((chunk) => !chunk.firstLoad);
  const width = Math.max(4, ...chunks.map((chunk) => chunk.file.length));

  const row = (chunk: ChunkSize): string =>
    `  ${chunk.file.padEnd(width)} ${kB(chunk.rawBytes)} ${kB(chunk.gzipBytes)}`;
  const totals = (label: string, group: ChunkSize[]): string =>
    `  ${label.padEnd(width)} ${kB(total(group, "rawBytes"))} ${kB(total(group, "gzipBytes"))}`;
  const header = `  ${"file".padEnd(width)} ${"raw kB".padStart(9)} ${"gzip kB".padStart(9)}`;

  return [
    `First load, referenced by index.html (${firstLoad.length} files)`,
    header,
    ...firstLoad.map(row),
    totals("total", firstLoad),
    "",
    `On demand, not referenced by index.html (${onDemand.length} files)`,
    header,
    ...onDemand.map(row),
    totals("total", onDemand),
  ].join("\n");
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const distDir = path.resolve(process.argv[2] ?? "dist");
  console.log(formatChunkReport(measureChunks(distDir)));
}
