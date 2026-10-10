// frontend/scripts/storybookWorkers.ts
//
// Works out how many workers the Storybook interaction tests may use.
// Read by `test-runner-jest.config.js`, so the cap applies however the
// tests are started: `just sbt`, `just sbtci` or a bare `yarn
// storybook:test`.
//
// The number comes from `SB_MAX_WORKERS`, in the environment or, failing
// that, in the root `.env`. Only that one line of the file is read: the
// rest of it is database credentials, which nothing here has a use for.
//
// Unset means no cap and jest picks its own worker count, which is what CI
// gets: a GitHub runner has no `.env` at all.
//
// Node loads this file as it stands, with the types stripped and nothing
// compiled, so it must keep to syntax that survives that: no enums, no
// parameter properties, no path aliases.

import fs from "fs";

const ENV_LINE = /^SB_MAX_WORKERS=(.*)$/;

// The number must end there or at a space, so "50%" is not read as 50.
const WORKER_COUNT = /^\s*(\d+)(?=\s|$)/;

/** A whole number of workers, one or more. Anything else is no cap. */
export function parseWorkerCount(
  value: string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const match = WORKER_COUNT.exec(value);

  if (!match) {
    return undefined;
  }

  const count = Number(match[1]);

  return count > 0 ? count : undefined;
}

/** The cap an env file sets. The last `SB_MAX_WORKERS` line wins. */
export function workersFromEnvFile(contents: string): number | undefined {
  let found: number | undefined;

  for (const line of contents.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);

    if (!match) {
      continue;
    }

    const count = parseWorkerCount(match[1]);

    if (count !== undefined) {
      found = count;
    }
  }

  return found;
}

/**
 * The worker cap, or undefined for none. A value in the environment wins
 * over the env file, so one run can be tuned without editing it.
 */
export function storybookMaxWorkers(
  envValue: string | undefined,
  envFilePath: string,
): number | undefined {
  const fromEnvironment = parseWorkerCount(envValue);

  if (fromEnvironment !== undefined) {
    return fromEnvironment;
  }

  let contents: string;

  try {
    contents = fs.readFileSync(envFilePath, "utf8");
  } catch {
    // No env file, or one that cannot be read: no cap.
    return undefined;
  }

  return workersFromEnvFile(contents);
}
