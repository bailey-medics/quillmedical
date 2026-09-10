// frontend/scripts/generate-json-from-yaml.ts
//
// Generates JSON files from YAML source for TypeScript type inference.
// Backend uses YAML directly via PyYAML - this is only for frontend TypeScript types.
//
// Run this as part of the frontend build process (prebuild/predev hooks)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_DIR = path.join(__dirname, "..", "..", "shared");
const FRONTEND_GENERATED_DIR = path.join(__dirname, "..", "src", "generated");

const FILES_TO_GENERATE = ["base-professions.yaml", "jurisdiction-config.yaml"];

// Competencies are split across a directory by kind — clinical.yaml and
// feature-admin.yaml — and merged back into one competencies.json here,
// so consumers see one flat catalogue and never need to know how the
// definitions are filed. Mirrors _load_competencies() in
// backend/app/cbac/competencies.py, including the sort: both sides must
// agree on the merged order.
const COMPETENCY_DEFINITIONS_DIR = path.join(
  SHARED_DIR,
  "competency-definitions",
);

interface Competency {
  id: string;
  [key: string]: unknown;
}

function generateCompetenciesJson(): void {
  console.log("  Processing competency-definitions/...");

  const files = fs
    .readdirSync(COMPETENCY_DEFINITIONS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      `No competency definitions found in ${COMPETENCY_DEFINITIONS_DIR}`,
    );
  }

  const competencies: Competency[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const filePath = path.join(COMPETENCY_DEFINITIONS_DIR, file);
    const data = yaml.load(fs.readFileSync(filePath, "utf8")) as {
      competencies: Competency[];
    };

    for (const competency of data.competencies) {
      const existing = seen.get(competency.id);
      if (existing !== undefined) {
        // Ids are referenced from stored records, so a duplicate would
        // make which definition applies depend on filename order.
        throw new Error(
          `Duplicate competency id "${competency.id}": defined in ` +
            `${existing} and ${file}. Ids must be unique across the ` +
            "whole directory.",
        );
      }
      seen.set(competency.id, file);
      competencies.push(competency);
    }
  }

  ensureDirectoryExists(FRONTEND_GENERATED_DIR);
  const outputPath = path.join(FRONTEND_GENERATED_DIR, "competencies.json");
  fs.writeFileSync(outputPath, JSON.stringify({ competencies }, null, 2));

  console.log(`  ✓ Generated ${outputPath} (${files.length} files merged)`);
}

function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateJson(yamlFile: string): void {
  const yamlPath = path.join(SHARED_DIR, yamlFile);
  const jsonFilename = yamlFile.replace(".yaml", ".json");
  const frontendJsonPath = path.join(FRONTEND_GENERATED_DIR, jsonFilename);

  console.log(`  Processing ${yamlFile}...`);

  const fileContents = fs.readFileSync(yamlPath, "utf8");
  const data = yaml.load(fileContents);

  ensureDirectoryExists(FRONTEND_GENERATED_DIR);
  fs.writeFileSync(frontendJsonPath, JSON.stringify(data, null, 2));

  console.log(`  ✓ Generated ${frontendJsonPath}`);
}

function main(): void {
  console.log("Generating JSON from YAML for TypeScript types...\n");

  for (const file of FILES_TO_GENERATE) {
    try {
      generateJson(file);
    } catch (error) {
      console.error(`  ✗ Error processing ${file}:`, error);
      process.exit(1);
    }
  }

  try {
    generateCompetenciesJson();
  } catch (error) {
    console.error("  ✗ Error processing competency-definitions/:", error);
    process.exit(1);
  }

  console.log("\nNote: Backend uses YAML directly via PyYAML.");
}

main();
