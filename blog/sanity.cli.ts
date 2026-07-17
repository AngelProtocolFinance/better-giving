import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: "5820hdyj",
    dataset: "production",
  },
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: true,
  },
  typegen: {
    // consumer's groq lives in platform; paths resolve relative to blog cwd
    path: "../platform/src/**/*.{ts,tsx}",
    schema: "./schema.json",
    generates: "../platform/src/types/sanity.types.ts",
    overloadClientMethods: true,
  },
});
