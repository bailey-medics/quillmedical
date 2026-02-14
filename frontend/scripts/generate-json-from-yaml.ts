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

const FILES_TO_GENERATE = [
  "competencies.yaml",
  "base-professions.yaml",
  "jurisdiction-config.yaml",
];

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

  console.log("\nNote: Backend uses YAML directly via PyYAML.");
}

main();
