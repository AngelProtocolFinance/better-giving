import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "openapi-typescript-codegen";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const specsDir = path.join(__dirname, "../specs/openapi");
const outputDir = path.join(__dirname, "../generated");

// API specifications mapping
const apiSpecs = [
  { name: "orders", file: "checkout_orders_v2.json", version: "v2" },
  { name: "payments", file: "payments_payment_v2.json", version: "v2" },
  { name: "invoicing", file: "invoicing_v2.json", version: "v2" },
  {
    name: "subscriptions",
    file: "billing_subscriptions_v1.json",
    version: "v1",
  },
  { name: "vault", file: "vault_payment_tokens_v3.json", version: "v3" },
  { name: "payouts", file: "payments_payouts_batch_v1.json", version: "v1" },
  {
    name: "partner-referrals",
    file: "customer_partner_referrals_v2.json",
    version: "v2",
  },
  { name: "disputes", file: "customer_disputes_v1.json", version: "v1" },
  { name: "catalog", file: "catalogs_products_v1.json", version: "v1" },
  {
    name: "tracking",
    file: "shipping_shipment_tracking_v1.json",
    version: "v1",
  },
  {
    name: "web-profiles",
    file: "payment-experience_web_experience_profiles_v1.json",
    version: "v1",
  },
  { name: "webhooks", file: "notifications_webhooks_v1.json", version: "v1" },
  {
    name: "transactions",
    file: "reporting_transactions_v1.json",
    version: "v1",
  },
];

// Clean and create output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

console.log(
  "Generating TypeScript SDK from PayPal OpenAPI specifications...\n"
);

// Generate SDK for each API
async function generateAll() {
  for (const api of apiSpecs) {
    const specPath = path.join(specsDir, api.file);
    const apiOutputDir = path.join(outputDir, api.name);

    if (!fs.existsSync(specPath)) {
      console.warn(
        `⚠️  Skipping ${api.name}: spec file not found at ${specPath}`
      );
      continue;
    }

    console.log(`📦 Generating ${api.name} (${api.version})...`);

    try {
      await generate({
        input: specPath,
        output: apiOutputDir,
        httpClient: "fetch",
        useOptions: true,
        useUnionTypes: true,
        exportCore: true,
        exportServices: true,
        exportModels: true,
        exportSchemas: false,
      });
      console.log(`✅ ${api.name} generated successfully\n`);
    } catch (error) {
      // fail the whole build — don't write export maps advertising subpaths whose
      // generated/<api>/index.ts is missing or incomplete
      console.error(`❌ Error generating ${api.name}:`, error.message);
      throw error;
    }
  }

  // Create main index file that exports all APIs
  console.log("📝 Creating main index files...");

  const generatedIndexContent = `// PayPal SDK - Generated TypeScript Client
// Generated from PayPal REST API OpenAPI Specifications

${apiSpecs.map((api) => `export * as ${api.name.replace(/-/g, "")} from './${api.name}/index.js';`).join("\n")}

export { PayPalClient, type PayPalClientConfig, type PayPalEnvironment } from '../src/index.js';
`;

  fs.writeFileSync(path.join(outputDir, "index.ts"), generatedIndexContent);

  // Update root index file
  const rootIndexContent = `// Export PayPalClient
export { PayPalClient, type PayPalClientConfig, type PayPalEnvironment } from './src/client.js';

// Export tree-shakeable factory functions
${apiSpecs
  .map((api) => {
    const serviceName = api.name.replace(/-/g, "_");
    const typeName = `${api.name
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("")}Service`;
    return `export { create_${serviceName}_service, type ${typeName} } from './src/factories/${api.name}.js';`;
  })
  .join("\n")}
`;

  fs.writeFileSync(path.join(__dirname, "../index.ts"), rootIndexContent);

  console.log("✅ SDK generation complete!");
  console.log("\nGenerated API clients:");
  apiSpecs.forEach((api) => {
    console.log(`  • ${api.name} (${api.version})`);
  });
  console.log("\nNext steps:");
  console.log("  pnpm run build   - Compile TypeScript to JavaScript");
  console.log("  pnpm publish     - Publish to npm registry");
}

generateAll().catch((error) => {
  console.error("Fatal error during generation:", error);
  process.exit(1);
});
