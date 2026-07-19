#!/usr/bin/env tsx

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SPECS_DIR = join(__dirname, "..", "specs");
const CUSTOM_SPECS_DIR = join(__dirname, "..", "custom_specs");
const BASE_URL =
  "https://raw.githubusercontent.com/paypal/paypal-rest-api-specifications/main/openapi";

// List of all PayPal OpenAPI specification files
const SPEC_FILES = [
  "checkout_orders_v2.json",
  "payments_payment_v2.json",
  "billing_subscriptions_v1.json",
  // "invoicing_v2.json",
  // "payments_payouts_batch_v1.json",
  // "vault_payment_tokens_v3.json",
  // "customer_disputes_v1.json",
  // "customer_partner_referrals_v2.json",
  "catalogs_products_v1.json",
  // "shipping_shipment_tracking_v1.json",
  // "payment-experience_web_experience_profiles_v1.json",
  // "reporting_transactions_v1.json",
  "notifications_webhooks_v1.json",
];

async function downloadSpec(filename: string): Promise<boolean> {
  const url = `${BASE_URL}/${filename}`;
  console.log(`Downloading ${filename}...`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.text();
    const outputPath = join(SPECS_DIR, filename);
    await writeFile(outputPath, data, "utf8");
    console.log(`✓ Downloaded ${filename}`);
    return true;
  } catch (error) {
    console.error(
      `✗ Failed to download ${filename}:`,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

async function copyCustomSpecs(): Promise<number> {
  console.log("\nCopying custom specifications...");

  try {
    // Check if custom_specs directory exists
    const entries = await readdir(CUSTOM_SPECS_DIR);
    let copiedCount = 0;

    for (const entry of entries) {
      const entryPath = join(CUSTOM_SPECS_DIR, entry);
      const entryStat = await stat(entryPath);

      // Only process directories (version folders like v1, v2, etc.)
      if (entryStat.isDirectory()) {
        const files = await readdir(entryPath);

        for (const file of files) {
          if (file.endsWith(".json")) {
            const sourcePath = join(entryPath, file);
            const destPath = join(SPECS_DIR, file);

            await copyFile(sourcePath, destPath);
            console.log(`✓ Copied custom spec: ${file}`);
            copiedCount++;
          }
        }
      }
    }

    return copiedCount;
  } catch (_error) {
    // Custom specs directory doesn't exist or is empty
    console.log("No custom specifications found (this is optional)");
    return 0;
  }
}

async function main(): Promise<void> {
  console.log("Creating specs directory...");
  await mkdir(SPECS_DIR, { recursive: true });

  console.log(
    `\nDownloading ${SPEC_FILES.length} PayPal OpenAPI specifications...\n`
  );

  const results = await Promise.all(SPEC_FILES.map(downloadSpec));
  const successCount = results.filter(Boolean).length;

  console.log(
    `\n✓ Downloaded ${successCount}/${SPEC_FILES.length} specifications`
  );

  // Copy custom specifications
  const customCount = await copyCustomSpecs();

  console.log(
    `\n✓ Total specifications ready: ${successCount + customCount} (${successCount} downloaded + ${customCount} custom)`
  );

  if (successCount < SPEC_FILES.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
