#!/usr/bin/env tsx

import { exec } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPECS_DIR = join(__dirname, "..", "specs");
const GENERATED_DIR = join(__dirname, "..", "src", "generated");

// Map of spec files to more friendly module names
const MODULE_NAMES: Record<string, string> = {
  "checkout_orders_v2.json": "orders",
  "payments_payment_v2.json": "payments",
  "payments_v1.json": "payments-v1",
  "billing_subscriptions_v1.json": "subscriptions",
  "invoicing_v2.json": "invoices",
  "payments_payouts_batch_v1.json": "payouts",
  "vault_payment_tokens_v3.json": "payment-tokens",
  "customer_disputes_v1.json": "disputes",
  "customer_partner_referrals_v2.json": "partner-referrals",
  "catalogs_products_v1.json": "catalog-products",
  "shipping_shipment_tracking_v1.json": "shipment-tracking",
  "payment-experience_web_experience_profiles_v1.json":
    "web-experience-profiles",
  "reporting_transactions_v1.json": "transaction-search",
  "notifications_webhooks_v1.json": "webhooks",
};

interface GenerateResult {
  moduleName: string;
  success: boolean;
}

async function generateTypes(specFile: string): Promise<GenerateResult> {
  const moduleName = MODULE_NAMES[specFile] || specFile.replace(".json", "");
  const inputPath = join(SPECS_DIR, specFile);
  const outputPath = join(GENERATED_DIR, `${moduleName}.ts`);

  console.log(`Generating types for ${moduleName}...`);

  try {
    // Use the CLI to generate types
    // Note: Removed --path-params-as-types to avoid TypeScript index signature conflicts
    // pnpm exec (not npx) so the pinned workspace openapi-typescript runs — npx can fall back to a registry version and drift the committed types
    const command = `pnpm exec openapi-typescript "${inputPath}" -o "${outputPath}" --export-type`;

    await execAsync(command);

    console.log(`✓ Generated ${moduleName}.ts`);
    return { moduleName, success: true };
  } catch (error) {
    console.error(
      `✗ Failed to generate types for ${moduleName}:`,
      error instanceof Error ? error.message : String(error)
    );
    return { moduleName, success: false };
  }
}

async function createIndexFile(modules: string[]): Promise<void> {
  const exports = modules
    .map(
      (moduleName) =>
        `export * as ${moduleName.replace(/-/g, "_")} from './${moduleName}.js';`
    )
    .join("\n");

  const indexContent = `/**
 * PayPal TypeScript Type Definitions
 * Generated from PayPal OpenAPI Specifications
 * https://github.com/paypal/paypal-rest-api-specifications
 */

${exports}
`;

  const indexPath = join(GENERATED_DIR, "index.ts");
  await writeFile(indexPath, indexContent, "utf8");
  console.log("✓ Generated index.ts");
}

async function main(): Promise<void> {
  console.log("Creating generated directory...");
  await mkdir(GENERATED_DIR, { recursive: true });

  console.log("\nGenerating TypeScript types from OpenAPI specifications...\n");

  const specFiles = await readdir(SPECS_DIR);
  const jsonFiles = specFiles.filter((f) => f.endsWith(".json"));

  const results = await Promise.all(jsonFiles.map(generateTypes));
  const successful = results.filter((r) => r.success);

  console.log("\nCreating index file...");
  await createIndexFile(successful.map((r) => r.moduleName));

  console.log(
    `\n✓ Generated types for ${successful.length}/${jsonFiles.length} specifications`
  );

  if (successful.length < jsonFiles.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
