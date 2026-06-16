import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

// build-time step: mirror the content-hashed client assets to vercel blob so
// they're served from a deploy-independent origin. cached html that references
// a hash from a rotated-out deployment still resolves (no /assets/* 404 storm),
// which lets us drop the skew-protection cookie and keep html cdn-cacheable.
// runs from react-router.config.ts buildEnd, gated on ASSET_BASE_URL.

const CLIENT_ASSETS_DIR = "build/client/assets";
// matches the base path in vite.config.ts: `${ASSET_BASE_URL}/assets/<file>`.
const BLOB_PREFIX = "assets";
const UPLOAD_CONCURRENCY = 12;
// content-hashed → immutable forever.
const CACHE_MAX_AGE = 31_536_000;

// browsers reject type=module scripts and fonts served with the wrong mime, and
// blob's inference isn't guaranteed for every extension — pin the load-bearing
// ones, let blob infer anything else.
const CONTENT_TYPES: Record<string, string> = {
  js: "text/javascript",
  css: "text/css",
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  svg: "image/svg+xml",
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  json: "application/json",
};

const ext_of = (name: string) =>
  name.slice(name.lastIndexOf(".") + 1).toLowerCase();

export async function upload_client_assets(): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is required to upload client assets"
    );
  }
  const { list, put } = await import("@vercel/blob");

  // hashed names are immutable, so anything already in blob is identical —
  // skip it. keeps redeploys cheap (only new chunks upload).
  const existing = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await list({
      prefix: `${BLOB_PREFIX}/`,
      cursor,
      limit: 1000,
      token,
    });
    for (const b of res.blobs) existing.add(b.pathname);
    cursor = res.cursor;
  } while (cursor);

  const entries = await readdir(CLIENT_ASSETS_DIR, {
    recursive: true,
    withFileTypes: true,
  });

  const pending: { local: string; pathname: string; ext: string }[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = ext_of(entry.name);
    // never publish source maps to a public bucket; they're unreferenced at
    // runtime (sourcemap: "hidden") and go to sentry instead.
    if (ext === "map") continue;
    const local = join(entry.parentPath, entry.name);
    const rel = relative(CLIENT_ASSETS_DIR, local).split(sep).join("/");
    const pathname = `${BLOB_PREFIX}/${rel}`;
    if (existing.has(pathname)) continue;
    pending.push({ local, pathname, ext });
  }

  let uploaded = 0;
  let cursor_i = 0;
  async function worker() {
    while (cursor_i < pending.length) {
      const item = pending[cursor_i++];
      const body = await readFile(item.local);
      await put(item.pathname, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: CACHE_MAX_AGE,
        contentType: CONTENT_TYPES[item.ext],
        token,
      });
      uploaded++;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, worker)
  );

  console.info(
    `[blob] client assets: ${uploaded} uploaded, ${existing.size} already present`
  );
}
