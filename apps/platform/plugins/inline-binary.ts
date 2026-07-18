import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// inlines a binary asset as a base64 string at build time. consumers decode
// with Buffer.from(<exported>, "base64"). use for server-only binary assets
// (fonts, images for pdf generation, etc.) that must travel with the
// serverless function bundle — vercel's node file tracing cannot follow
// dynamic readFile(new URL(..., import.meta.url)) lookups, and plain ?url
// imports only emit to the client/cdn output.
const SUFFIX = "?bin";

export function inline_binary(): Plugin {
  return {
    name: "inline-binary",
    enforce: "pre",
    async resolveId(source, importer) {
      if (!source.endsWith(SUFFIX)) return null;
      const base = source.slice(0, -SUFFIX.length);
      const resolved = await this.resolve(base, importer, { skipSelf: true });
      if (!resolved) return null;
      return `${resolved.id}${SUFFIX}`;
    },
    load(id) {
      if (!id.endsWith(SUFFIX)) return null;
      const path = id.slice(0, -SUFFIX.length);
      this.addWatchFile(path);
      const b64 = readFileSync(path).toString("base64");
      return `export default ${JSON.stringify(b64)};`;
    },
  };
}
