// local gallery for the design-sync bundle.
//
// the converter emits one self-contained card per component
// (components/<group>/<Name>/<Name>.html) whose stylesheet, vendor and bundle
// links are relative to the bundle root — so serving that root statically is
// the whole gallery. this adds the one thing the bundle has no file for: an
// index at "/" listing every card.
//
// deliberately local-only and dependency-free. the gallery is a look-at-it
// tool for whoever is running /design-sync, not a deployed site — a fourth
// vercel project would cost an ops slot on a team capped at one concurrent
// build, and buy nobody anything.

import { readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    port: { type: "string", short: "p" },
  },
});

// `--out ./ds-bundle` from this app's own cwd, which is where NOTES.md says
// every design-sync command runs. the flag is here so a bundle written
// elsewhere needs no code change to browse.
const ROOT = resolve(
  values.dir ?? process.env.DS_BUNDLE ?? join(import.meta.dirname, "ds-bundle")
);
const PORT = Number(values.port ?? process.env.PORT ?? 4300);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/** every card, grouped the way the bundle lays them out on disk */
async function cards() {
  const groups = [];
  for (const group of (
    await readdir(join(ROOT, "components"), { withFileTypes: true })
  ).filter((d) => d.isDirectory())) {
    const names = (
      await readdir(join(ROOT, "components", group.name), {
        withFileTypes: true,
      })
    )
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    if (names.length) groups.push({ group: group.name, names });
  }
  return groups.sort((a, b) => a.group.localeCompare(b.group));
}

function index(groups) {
  const total = groups.reduce((n, g) => n + g.names.length, 0);
  const sections = groups
    .map(
      (g) => `<section>
      <h2>${g.group}</h2>
      <ul>${g.names
        .map(
          (n) =>
            `<li><a href="/components/${g.group}/${n}/${n}.html">${n}</a></li>`
        )
        .join("")}</ul>
    </section>`
    )
    .join("\n");

  // the index is chrome around the cards, not a design-system artifact — it is
  // never uploaded, so it stays plain and owns no tokens.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>design-sync gallery</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:light}
  body{margin:0;padding:32px;font:14px/1.5 system-ui,sans-serif;color:#111}
  h1{font-size:18px;margin:0 0 4px}
  p.meta{margin:0 0 28px;color:#6b7280}
  section{margin:0 0 24px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:0 0 8px}
  ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px}
  a{display:block;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;text-decoration:none;color:#111}
  a:hover{background:#f9fafb}
  code{background:#f3f4f6;padding:1px 5px;border-radius:4px}
</style></head>
<body>
  <h1>design-sync gallery</h1>
  <p class="meta">${total} components from <code>${ROOT}</code></p>
  ${sections}
</body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    try {
      const body = index(await cards());
      res.writeHead(200, { "content-type": MIME[".html"] });
      return res.end(body);
    } catch {
      res.writeHead(404, { "content-type": MIME[".html"] });
      return res.end(
        `<p>No bundle at <code>${ROOT}</code> — run <code>/design-sync</code> first, or point at one with <code>--dir</code>.</p>`
      );
    }
  }

  // normalize before joining: a "../" in the request must not escape the bundle
  const file = join(ROOT, normalize(pathname));
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403);
    return res.end("forbidden");
  }

  try {
    if ((await stat(file)).isDirectory()) throw new Error("dir");
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      // the bundle is rebuilt in place; a cached card hides the rebuild
      "cache-control": "no-store",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`design-sync gallery  http://localhost:${PORT}`);
  console.log(`serving              ${ROOT}`);
});
