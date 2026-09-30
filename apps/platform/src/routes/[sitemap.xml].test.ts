import { describe, expect, test, vi } from "vitest";

const fetch_mock = vi.hoisted(() => vi.fn());
vi.mock("#/api/sanity", () => ({ sanity: { fetch: fetch_mock } }));

import { loader } from "./[sitemap.xml]";

const sitemap = async () => {
  const res = (await loader({
    request: new Request("https://better.giving/sitemap.xml"),
    params: {},
    context: {},
  } as any)) as Response;
  return res.text();
};

describe("sitemap", () => {
  test("a post slug with xml metacharacters yields a well-formed <loc> matching the card link", async () => {
    fetch_mock.mockResolvedValue([
      { slug: "tips & <tricks>", _updatedAt: "2026-09-01T00:00:00Z" },
    ]);
    const xml = await sitemap();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain(
      "https://better.giving/blog/tips%20%26%20%3Ctricks%3E"
    );
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
});
