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
    // strictly unidirectional: blog -> blog-types -> platform. blog owns the
    // groq (./queries.ts) and the schema (schema.json); typegen scans ONLY blog
    // and emits the result types + @sanity/client overload into the shared
    // `blog-types` package's generated `types.ts`. the query STRINGS are
    // separately copied into the package (see the `typegen` npm script) so
    // platform can run them without importing blog. paths resolve to blog cwd.
    path: "./queries.ts",
    schema: "./schema.json",
    generates: "../packages/types/blog/types.ts",
    overloadClientMethods: true,
  },
});
