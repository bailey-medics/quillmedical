// frontend/scripts/computeCompatGeneration.ts
//
// Computes the frontend's build-time `required_client_generation` from the
// repo-root `api-compatibility/` decision files, mirroring the backend's
// `compute_required_client_generation` in `backend/app/api_compatibility.py`
// exactly (same formula, same folder, same commit) so both sides of a build
// always agree. Imported by vite.config.ts / vitest.config.ts (Node context,
// evaluated at config-load time) — never bundled into the browser build.

import fs from "fs";
import path from "path";
import yaml from "js-yaml";

/**
 * required_client_generation = max(generation for forces_reload: true files)
 * or 1 if none exist. Malformed/non-mapping files are skipped rather than
 * thrown on — CI's `validate-compat-files.sh` is the authority on
 * well-formedness.
 */
export function computeRequiredClientGeneration(compatDir: string): number {
  if (!fs.existsSync(compatDir) || !fs.statSync(compatDir).isDirectory()) {
    return 1;
  }

  const trueGenerations: number[] = [];
  const files = fs
    .readdirSync(compatDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  for (const file of files) {
    let data: unknown;
    try {
      data = yaml.load(fs.readFileSync(path.join(compatDir, file), "utf8"));
    } catch {
      continue;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const record = data as Record<string, unknown>;
    if (
      record.forces_reload === true &&
      typeof record.generation === "number" &&
      Number.isInteger(record.generation)
    ) {
      trueGenerations.push(record.generation);
    }
  }

  return trueGenerations.length > 0 ? Math.max(...trueGenerations) : 1;
}
