// verification scaffolding — preload (`node --import`) that points the neon
// serverless driver at a LOCAL postgres instead of neon. no product code
// changes: it configures the same `neonConfig` singleton db.ts and migrate.ts
// import, before they import it.
//   - http queries (poolQueryViaFetch) → `fetchFunction` runs them in-process
//     with `pg`, answering in neon's /sql json shape (raw text, array mode)
//   - transactions (pool.connect over websocket) → a ws→tcp pipe on
//     VERIFY_WS_PORT (default 5488)
// refuses any DATABASE_URL whose host isn't localhost/127.0.0.1.
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const req = createRequire(path.join(process.cwd(), "package.json"));
// the ESM entry — the instance db.ts/migrate.ts get from `import`
const neon_dir = path.dirname(req.resolve("@neondatabase/serverless"));
const { neonConfig } = await import(
  pathToFileURL(path.join(neon_dir, "index.mjs")).href
);
// pg isn't a direct platform dep; take pnpm's hoisted copy (8.x, via drizzle)
const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../../.."
);
const pg = createRequire(
  path.join(root, "node_modules/.pnpm/node_modules/x.js")
)("pg");
const { WebSocketServer } = req("ws");

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1"].includes(host)) {
  console.error(`[neon-local] refusing non-local DATABASE_URL host "${host}"`);
  process.exit(1);
}

const WS_PORT = Number(process.env.VERIFY_WS_PORT ?? 5488);
const raw = { getTypeParser: () => (v) => v };
const pools = new Map();
const pool_for = (cs) => {
  if (!pools.has(cs))
    pools.set(cs, new pg.Pool({ connectionString: cs, max: 5 }));
  return pools.get(cs);
};
const shape = (r) => ({
  command: r.command,
  rowCount: r.rowCount,
  rows: r.rows,
  fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
});
const run = (c, q) =>
  c.query({
    text: q.query,
    values: q.params ?? [],
    rowMode: "array",
    types: raw,
  });

neonConfig.fetchFunction = async (_ep, init) => {
  // the driver's Neon-Connection-String header drops the port and password,
  // so run against the (already host-checked) DATABASE_URL instead
  const cs = url;
  const body = JSON.parse(init.body);
  const p = pool_for(cs);
  try {
    if (Array.isArray(body.queries)) {
      const c = await p.connect();
      try {
        await c.query("BEGIN");
        const results = [];
        for (const q of body.queries) results.push(shape(await run(c, q)));
        await c.query("COMMIT");
        return Response.json({ results });
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    }
    return Response.json(shape(await run(p, body)));
  } catch (e) {
    const {
      message,
      code,
      detail,
      hint,
      position,
      schema,
      table,
      column,
      constraint,
    } = e;
    return Response.json(
      {
        message,
        code,
        detail,
        hint,
        position,
        schema,
        table,
        column,
        constraint,
      },
      { status: 400 }
    );
  }
};

if (!globalThis.__verify_ws) {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: WS_PORT });
  wss.on("error", (e) => {
    if (e.code !== "EADDRINUSE") console.error("[neon-local] ws", e);
  });
  wss.on("connection", (sock, reqm) => {
    const addr =
      new URL(reqm.url, "http://x").searchParams.get("address") ?? "";
    const [h, port] = addr.split(":");
    if (!["localhost", "127.0.0.1"].includes(h)) return sock.close();
    const tcp = net.connect(Number(port || 5432), h);
    tcp.on("data", (d) => sock.send(d));
    sock.on("message", (d) => tcp.write(d));
    tcp.on("close", () => sock.close());
    tcp.on("error", () => sock.close());
    sock.on("close", () => tcp.destroy());
  });
  globalThis.__verify_ws = wss;
  wss.unref?.();
  // unref the listening socket so one-shot scripts (migrate) still exit
  wss._server?.unref?.();
}
neonConfig.wsProxy = (h, p) => `127.0.0.1:${WS_PORT}/v1?address=${h}:${p}`;
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;
neonConfig.pipelineTLS = false;
console.error(
  `[neon-local] neon driver → local postgres ${host} (ws :${WS_PORT})`
);
