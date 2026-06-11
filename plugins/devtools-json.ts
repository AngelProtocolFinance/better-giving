import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Plugin } from "vite";

// serves /.well-known/appspecific/com.chrome.devtools.json during dev so
// chrome devtools can auto-discover the project root and open local files
// directly in the editor (automatic workspace folders).
// see: https://goo.gle/devtools-json-design
const ENDPOINT = "/.well-known/appspecific/com.chrome.devtools.json";

// uuid v4 regex
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function devtools_json(): Plugin {
  return {
    name: "devtools-json",
    enforce: "post",

    configureServer(server) {
      const { config } = server;
      if (!config.env.DEV) return;

      const getOrCreateUUID = (): string => {
        let { cacheDir } = config;
        if (!isAbsolute(cacheDir)) {
          const root = isAbsolute(config.root)
            ? config.root
            : resolve(process.cwd(), config.root);
          cacheDir = resolve(root, cacheDir);
        }

        const uuidPath = resolve(cacheDir, "uuid.json");
        if (existsSync(uuidPath)) {
          const cached = readFileSync(uuidPath, "utf-8").trim();
          if (UUID_RE.test(cached)) return cached;
        }

        if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
        const uuid = randomUUID();
        writeFileSync(uuidPath, uuid, "utf-8");
        return uuid;
      };

      server.middlewares.use(ENDPOINT, (_req, res) => {
        const root = isAbsolute(config.root)
          ? config.root
          : resolve(process.cwd(), config.root);

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify(
            { workspace: { root, uuid: getOrCreateUUID() } },
            null,
            2
          )
        );
      });
    },

    configurePreviewServer(server) {
      server.middlewares.use(ENDPOINT, (_req, res) => {
        res.writeHead(404);
        res.end();
      });
    },
  };
}
