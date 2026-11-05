// frontend/scripts/generate-json-from-yaml.ts
//
// Generates JSON files from YAML source for TypeScript type inference.
// Backend uses YAML directly via PyYAML - this is only for frontend TypeScript types.
//
// Run this as part of the frontend build process (prebuild/predev hooks)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_DIR = path.join(__dirname, "..", "..", "shared");
const FRONTEND_GENERATED_DIR = path.join(__dirname, "..", "src", "generated");

const FILES_TO_GENERATE = [
  "base-professions.yaml",
  // The words a framework may be filed under, for the filter on the
  // list of frameworks.
  "specialties.yaml",
  "jurisdiction-config.yaml",
  // The screens that offer a kind of place to pick from used to
  // carry their own copy of the list, which is how three of them
  // came to disagree with the backend about what exists.
  "org-unit-types.yaml",
  // Colours for the Mantine theme and the email themes, which the
  // backend's email renderer reads from the same file.
  "brand.yaml",
];

// Competencies are split across a directory by kind -
// clinical-permissions.yaml, clinical-admin.yaml, admin.yaml,
// teaching.yaml, passport.yaml and safety.yaml - and merged back into one
// competencies.json here, so consumers see one flat catalogue and never
// need to know how the definitions are filed. Mirrors
// _load_competencies() in backend/app/cbac/competencies.py, including
// the sort: both sides must agree on the merged order.
const COMPETENCY_DEFINITIONS_DIR = path.join(
  SHARED_DIR,
  "competency-definitions",
);

interface Competency {
  id: string;
  [key: string]: unknown;
}

// A file that declares a `framework:` block is a framework: one published
// document a clinician works to. The frontend reads frameworks from
// GET /api/passport/catalogue, so they are left out of competencies.json,
// which holds permissions only, and CompetencyId names permissions. The
// one exception is the test fixtures in shared/framework-fixtures/,
// written to framework-fixtures.json for the unit tests and Storybook.
interface Framework {
  id: string;
  [key: string]: unknown;
}

const FRAMEWORK_FIXTURES_DIR = path.join(SHARED_DIR, "framework-fixtures");

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
      framework?: Framework;
      competencies: Competency[];
    };

    // A framework's ids are still checked for clashes with the
    // permissions, as the backend's loader checks them, but not kept.
    const isFramework = data.framework !== undefined;

    for (const raw of data.competencies) {
      const competency: Competency = raw;

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
      if (!isFramework) competencies.push(competency);
    }
  }

  ensureDirectoryExists(FRONTEND_GENERATED_DIR);
  const outputPath = path.join(FRONTEND_GENERATED_DIR, "competencies.json");
  fs.writeFileSync(outputPath, JSON.stringify({ competencies }, null, 2));

  console.log(`  ✓ Generated ${outputPath} (${files.length} files merged)`);
}

function generateFrameworkFixturesJson(): void {
  console.log("  Processing framework-fixtures/...");

  const fixtures = fs
    .readdirSync(FRAMEWORK_FIXTURES_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map(
      (file) =>
        yaml.load(
          fs.readFileSync(path.join(FRAMEWORK_FIXTURES_DIR, file), "utf8"),
        ) as { framework: Framework; competencies: Competency[] },
    );

  ensureDirectoryExists(FRONTEND_GENERATED_DIR);
  const outputPath = path.join(
    FRONTEND_GENERATED_DIR,
    "framework-fixtures.json",
  );
  fs.writeFileSync(outputPath, JSON.stringify({ fixtures }, null, 2));

  console.log(`  ✓ Generated ${outputPath} (${fixtures.length} frameworks)`);
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

  try {
    generateFrameworkFixturesJson();
  } catch (error) {
    console.error("  ✗ Error processing framework-fixtures/:", error);
    process.exit(1);
  }

  console.log("\nNote: Backend uses YAML directly via PyYAML.");
}

main();
