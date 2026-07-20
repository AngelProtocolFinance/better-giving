#!/usr/bin/env tsx

import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPECS_DIR = join(__dirname, "..", "specs");
const GENERATED_DIR = join(__dirname, "..", "src", "generated");

async function generateTypes(): Promise<void> {
  const inputPath = join(SPECS_DIR, "chariot.yaml");
  const outputPath = join(GENERATED_DIR, "chariot.ts");

  console.log("Generating types for Chariot API...");

  try {
    const command = `npx openapi-typescript "${inputPath}" -o "${outputPath}" --export-type`;
    await execAsync(command);
    console.log("✓ Generated chariot.ts");
  } catch (error) {
    console.error(
      "✗ Failed to generate types:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

async function createIndexFile(): Promise<void> {
  const indexContent = `/**
 * Chariot TypeScript Type Definitions
 * Generated from Chariot OpenAPI Specification
 * https://github.com/chariot-giving/chariot-openapi
 */

export * as chariot from './chariot.js';
`;

  const indexPath = join(GENERATED_DIR, "index.ts");
  await writeFile(indexPath, indexContent, "utf8");
  console.log("✓ Generated index.ts");
}

async function main(): Promise<void> {
  console.log("Creating generated directory...");
  await mkdir(GENERATED_DIR, { recursive: true });

  console.log("\nGenerating TypeScript types from OpenAPI specification...\n");

  await generateTypes();

  console.log("\nCreating index file...");
  await createIndexFile();

  console.log("\n✓ Type generation complete");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
