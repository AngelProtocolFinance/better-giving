import { describe, expect, test } from "vitest";
import { sources_of } from "./conformance/walk";

/** a page module's loader/action signals a refusal by throwing `resp.status(…)`
 *  so the route's ErrorBoundary renders it. a `return` hands the Response to the
 *  fetcher/loaderData as data, where the page treats it as success. resource
 *  routes (no default export) answer a bare client, so they return. */

const P = "apps/platform/src/";
const EXEMPT = new Set([`${P}routes/_helpers/validate-api-key.ts`]);

const corpus = new Map(
  sources_of(import.meta.url, (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  )
    .filter((s) => s.file.startsWith(P) && /\.tsx?$/.test(s.file))
    .map((s) => [s.file, s.text])
);

const in_scope = (f: string) =>
  f.startsWith(`${P}routes/`) || f.startsWith(`${P}pages/`);
const has_default = (t: string) =>
  /^export\s+default\b|^export\s*\{[^}]*\bas\s+default\b/m.test(t);

const dirname = (f: string) => f.slice(0, f.lastIndexOf("/"));
function normalize(path: string) {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "..") out.pop();
    else if (seg !== ".") out.push(seg);
  }
  return out.join("/");
}
function resolve_import(from: string, spec: string): string | undefined {
  let base: string;
  if (spec.startsWith("#/")) base = P + spec.slice(2);
  else if (spec.startsWith(".")) base = normalize(`${dirname(from)}/${spec}`);
  else return undefined;
  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    base,
  ].find((c) => corpus.has(c));
}
const IMPORT_RE = /(?:from|import\()\s*["']([^"']+)["']/g;

/** every routes/pages module a page module (default export) reaches */
function page_graph() {
  const seen = new Set<string>();
  const stack = [...corpus]
    .filter(([f, t]) => f.startsWith(`${P}routes/`) && has_default(t))
    .map(([f]) => f);
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of corpus.get(f)!.matchAll(IMPORT_RE)) {
      const r = resolve_import(f, m[1]);
      if (r && in_scope(r) && !seen.has(r)) stack.push(r);
    }
  }
  return seen;
}

const RETURNED_REFUSAL = [
  /\breturn\s+resp\.status\(/,
  // a `new Response(…)` return whose init carries a 4xx/5xx status
  /\breturn\s+new Response\((?:(?!;\s*$)[\s\S])*?status:\s*[45]\d\d\b/m,
  // a plain object shaped like one: a 200 nobody reads
  /\breturn\s+\{\s*status:\s*[45]\d\d\b/,
];
const returns_refusal = (text: string) =>
  RETURNED_REFUSAL.some((re) => re.test(text));

describe("page modules throw refusals, never return them", () => {
  const files = [...page_graph()].filter((f) => !EXEMPT.has(f)).sort();

  test("the walk reaches the page modules and the pages/** modules they import", () => {
    expect(files).toContain(`${P}routes/admin.$id.media/api.ts`);
    expect(files).toContain(`${P}pages/admin/media/api.ts`);
    expect(files).not.toContain(`${P}routes/api.paypal-webhook/route.ts`);
  });

  test("the matcher flags a returned refusal and passes a thrown one", () => {
    expect(returns_refusal(`if (!x) return resp.status(404);`)).toBe(true);
    expect(
      returns_refusal(`return new Response("no", {\n status: 404,\n});`)
    ).toBe(true);
    expect(returns_refusal(`if (!x) return { status: 404 };`)).toBe(true);
    expect(
      returns_refusal(`return { status: 400, statusText: "not member" };`)
    ).toBe(true);
    expect(returns_refusal(`if (!x) throw resp.status(404);`)).toBe(false);
    expect(returns_refusal(`return new Response("ok", { status: 200 });`)).toBe(
      false
    );
  });

  test("no loader/action returns a 4xx/5xx Response", () => {
    const offenders = files.filter((f) => returns_refusal(corpus.get(f)!));
    expect(offenders).toEqual([]);
  });
});
