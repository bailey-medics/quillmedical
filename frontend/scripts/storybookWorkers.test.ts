// frontend/scripts/storybookWorkers.test.ts

import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  parseWorkerCount,
  storybookMaxWorkers,
  workersFromEnvFile,
} from "./storybookWorkers";

function makeEnvFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storybook-workers-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, contents);

  return file;
}

describe("parseWorkerCount", () => {
  it("reads a whole number", () => {
    expect(parseWorkerCount("4")).toBe(4);
  });

  it("ignores what follows the number", () => {
    expect(parseWorkerCount(" 6 # half the cores")).toBe(6);
  });

  it.each([undefined, "", "CHANGE_ME", "0", "-2", "50%"])(
    "gives no cap for %s",
    (value) => {
      expect(parseWorkerCount(value)).toBeUndefined();
    },
  );
});

describe("workersFromEnvFile", () => {
  it("finds the line among the others", () => {
    const contents = "POSTGRES_DB=quill\nSB_MAX_WORKERS=4\nEHRBASE_USER=e\n";

    expect(workersFromEnvFile(contents)).toBe(4);
  });

  it("takes the last line when there are several", () => {
    expect(workersFromEnvFile("SB_MAX_WORKERS=2\nSB_MAX_WORKERS=5\n")).toBe(5);
  });

  it("reads a file with Windows line endings", () => {
    expect(workersFromEnvFile("A=1\r\nSB_MAX_WORKERS=3\r\n")).toBe(3);
  });

  it("gives no cap when the line is missing", () => {
    expect(workersFromEnvFile("POSTGRES_DB=quill\n")).toBeUndefined();
  });

  it("gives no cap for the placeholder in .env-sample", () => {
    expect(workersFromEnvFile("SB_MAX_WORKERS=CHANGE_ME\n")).toBeUndefined();
  });

  it("ignores a line that is commented out", () => {
    expect(workersFromEnvFile("# SB_MAX_WORKERS=4\n")).toBeUndefined();
  });

  it("ignores another setting that ends with the same name", () => {
    expect(workersFromEnvFile("OLD_SB_MAX_WORKERS=4\n")).toBeUndefined();
  });
});

describe("storybookMaxWorkers", () => {
  it("reads the cap from the env file", () => {
    const file = makeEnvFile("POSTGRES_PASSWORD=secret\nSB_MAX_WORKERS=4\n");

    expect(storybookMaxWorkers(undefined, file)).toBe(4);
  });

  it("lets the environment win over the env file", () => {
    const file = makeEnvFile("SB_MAX_WORKERS=4\n");

    expect(storybookMaxWorkers("2", file)).toBe(2);
  });

  it("falls back to the env file when the environment value is no number", () => {
    const file = makeEnvFile("SB_MAX_WORKERS=4\n");

    expect(storybookMaxWorkers("", file)).toBe(4);
  });

  it("gives no cap when there is no env file", () => {
    const missing = path.join(os.tmpdir(), "storybook-workers-none", ".env");

    expect(storybookMaxWorkers(undefined, missing)).toBeUndefined();
  });
});
