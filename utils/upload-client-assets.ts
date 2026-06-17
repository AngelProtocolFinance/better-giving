import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, head, put } from "@vercel/blob";

// asset_base_url is expected to end in "/" (vite base convention).

// mirror content-hashed client assets to vercel blob so html cached from a
// rotated-out deployment can still load its assets from a deploy-independent
// origin (see vite.config.ts `base` + entry.server.tsx `durable_assets`).
//
// only build/client/assets/** is uploaded: every file there is content-hashed
// and immutable, so the upload is append-only and safe to skip when the name is
// already present (identical name implies identical bytes). public files
// (favicon, /icons/*) are referenced via literal origin paths, never get the
// blob base, and stay on the deployment — so they're intentionally excluded.
//
// reads BLOB_READ_WRITE_TOKEN from env (via @vercel/blob). caller passes the
// asset base url; it must point at the same blob store BLOB_READ_WRITE_TOKEN
// writes to, or the baked asset urls won't resolve.
const ASSETS_DIR = path.resolve("build/client/assets");
const CONCURRENCY = 12;
const IMMUTABLE_MAX_AGE = 31_536_000; // 1y — hashed assets never change

export async function upload_client_assets(asset_base_url: string) {
  const entries = await readdir(ASSETS_DIR, {
    recursive: true,
    withFileTypes: true,
  });
  const rel_paths = entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(ASSETS_DIR, path.join(e.parentPath, e.name)));

  let uploaded = 0;
  let skipped = 0;
  for (let i = 0; i < rel_paths.length; i += CONCURRENCY) {
    await Promise.all(
      rel_paths.slice(i, i + CONCURRENCY).map(async (rel) => {
        const pathname = `assets/${rel.split(path.sep).join("/")}`;
        const url = `${asset_base_url}${pathname}`;
        if (await blob_exists(url)) {
          skipped++;
          return;
        }
        await put(pathname, await readFile(path.join(ASSETS_DIR, rel)), {
          access: "public",
          addRandomSuffix: false,
          // concurrent deploys may upload the same new (hashed) file; bytes are
          // identical so overwrite is harmless and avoids a race failure.
          allowOverwrite: true,
          cacheControlMaxAge: IMMUTABLE_MAX_AGE,
        });
        uploaded++;
      })
    );
  }
  console.log(
    `[upload-client-assets] ${uploaded} uploaded, ${skipped} already present`
  );
}

async function blob_exists(url: string): Promise<boolean> {
  try {
    await head(url);
    return true;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return false;
    throw err;
  }
}
