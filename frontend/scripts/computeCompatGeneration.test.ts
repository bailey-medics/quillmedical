// frontend/scripts/computeCompatGeneration.test.ts
//
// Formula correctness for computeRequiredClientGeneration — mirrors
// backend/tests/test_api_compatibility.py's TestComputeRequiredClientGeneration.

import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { computeRequiredClientGeneration } from "./computeCompatGeneration";

function writeFile(
  dir: string,
  filename: string,
  generation: number,
  forcesReload: boolean,
): void {
  fs.writeFileSync(
    path.join(dir, filename),
    `generation: ${generation}\n` +
      `forces_reload: ${forcesReload ? "true" : "false"}\n` +
      `change: "some-change"\n` +
      `reason: "some reason"\n`,
  );
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "compat-gen-test-"));
}

describe("computeRequiredClientGeneration", () => {
  it("returns 1 when the directory does not exist", () => {
    const missing = path.join(os.tmpdir(), "does-not-exist-" + Date.now());
    expect(computeRequiredClientGeneration(missing)).toBe(1);
  });

  it("returns 1 when no forces_reload: true files exist", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-init.yaml", 1, false);
    expect(computeRequiredClientGeneration(dir)).toBe(1);
  });

  it("returns the generation of a single forces_reload: true file", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-init.yaml", 1, false);
    writeFile(dir, "20260819000000-breaking.yaml", 3, true);
    expect(computeRequiredClientGeneration(dir)).toBe(3);
  });

  it("returns the max generation among multiple forces_reload: true files", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-a.yaml", 2, true);
    writeFile(dir, "20260819000000-b.yaml", 5, true);
    writeFile(dir, "20260820000000-c.yaml", 3, true);
    expect(computeRequiredClientGeneration(dir)).toBe(5);
  });

  it("ignores forces_reload: false files when computing the max", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-a.yaml", 2, true);
    writeFile(dir, "20260819000000-b.yaml", 99, false);
    expect(computeRequiredClientGeneration(dir)).toBe(2);
  });

  it("skips malformed YAML files", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-a.yaml", 2, true);
    fs.writeFileSync(
      path.join(dir, "20260819000000-bad.yaml"),
      "forces_reload: [true\n",
    );
    expect(computeRequiredClientGeneration(dir)).toBe(2);
  });

  it("skips non-mapping YAML (e.g. a bare list or scalar)", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-a.yaml", 2, true);
    fs.writeFileSync(
      path.join(dir, "20260819000000-list.yaml"),
      "- one\n- two\n",
    );
    expect(computeRequiredClientGeneration(dir)).toBe(2);
  });

  it("skips files where generation is not an integer", () => {
    const dir = makeTempDir();
    writeFile(dir, "20260818000000-a.yaml", 2, true);
    fs.writeFileSync(
      path.join(dir, "20260819000000-bad-gen.yaml"),
      'generation: "not-a-number"\nforces_reload: true\nchange: "x"\nreason: "y"\n',
    );
    expect(computeRequiredClientGeneration(dir)).toBe(2);
  });
});
