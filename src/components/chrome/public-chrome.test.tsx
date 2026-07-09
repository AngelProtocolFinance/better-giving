import { describe, expect, test } from "vitest";
import { CHROME_BY_SEGMENT, chrome_for } from "./public-chrome";

// enumerate the real route module tree at build time. eager:false keeps this a
// map of path -> importer (we only need the keys/paths, never the modules), so
// no route code actually runs. glob is resolved by vite in the browser test env
// where node `fs` is unavailable.
const route_modules = import.meta.glob("/src/routes/**/*.{ts,tsx}");

// flatRoutes route id -> first url path segment.
//   "_app.marketplace.filter/route.tsx" -> "marketplace"
//   "_landing.pricing/route.tsx"        -> "pricing"
//   "_app.blog_.$slug/route.tsx"        -> "blog" (trailing _ escapes nesting)
//   "_app.nonprofit.ts"                 -> "nonprofit" (flat single-file route)
// returns null for routes that never mount the public chrome layout: pathless
// wrappers themselves, dynamic-only first segments, and non-public trees.
function public_segment(path: string): string | null {
  // the flatRoutes route id is the first path part after routes/ — either a
  // route folder ("_app.foo") or a flat single-file route ("_app.foo.ts").
  // for the single-file case, drop only the .ts/.tsx extension.
  const rel = path.replace(/^\/src\/routes\//, "");
  const first = rel.split("/")[0];
  const file = rel.includes("/") ? first : first.replace(/\.(ts|tsx)$/, "");

  // only routes under the public layout wrappers render PublicHeader/Footer.
  let inner: string;
  if (file === "_app" || file.startsWith("_app.")) {
    inner = file.slice("_app".length).replace(/^\./, "");
  } else if (file === "_landing" || file.startsWith("_landing.")) {
    inner = file.slice("_landing".length).replace(/^\./, "");
  } else {
    return null; // _index, admin.*, dashboard.*, platform.*, api.*, etc.
  }

  if (!inner) return null; // the wrapper route module itself
  // first flat segment; strip the trailing "_" escape flatRoutes allows.
  const seg = inner.split(".")[0].replace(/_$/, "");
  if (!seg || seg.startsWith("$")) return null; // dynamic-only first segment
  if (seg.startsWith("_")) return null; // pathless index like _index/_steps
  return seg;
}

// resource routes (loader-only .ts files, no component) never mount the layout,
// so they need no chrome classification. component routes live in .tsx files.
function is_component_route(path: string): boolean {
  return path.endsWith(".tsx");
}

describe("chrome_for", () => {
  test("resolves each intent bucket by first path segment", () => {
    expect(chrome_for("/login")).toBe("bare");
    expect(chrome_for("/register/abc/step/1")).toBe("bare");
    expect(chrome_for("/marketplace")).toBe("minimal");
    expect(chrome_for("/marketplace/123/program/9")).toBe("minimal");
    expect(chrome_for("/product")).toBe("marketing");
    expect(chrome_for("/")).toBe("marketing");
  });
});

describe("chrome seam drift", () => {
  // the load-bearing assertion: every public component route's top-level
  // segment MUST be classified intentionally in CHROME_BY_SEGMENT. adding
  // `src/routes/_app.newthing/route.tsx` without a "newthing" entry fails HERE
  // (listing the segment as unclassified) instead of silently rendering
  // marketing chrome in prod.
  const public_segments = Array.from(
    new Set(
      Object.keys(route_modules)
        .filter(is_component_route)
        .map(public_segment)
        .filter((s): s is string => s !== null)
    )
  ).sort();

  test("route table is non-empty (glob resolved)", () => {
    expect(public_segments.length).toBeGreaterThan(0);
  });

  test.each(
    public_segments
  )("public segment %s is intentionally classified", (segment) => {
    expect(CHROME_BY_SEGMENT).toHaveProperty(segment);
  });

  test("no stale entries: every classified segment maps to a real route", () => {
    const stale = Object.keys(CHROME_BY_SEGMENT).filter(
      (seg) => !public_segments.includes(seg)
    );
    expect(stale).toEqual([]);
  });
});
