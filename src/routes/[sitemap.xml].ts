import type { LoaderFunction } from "react-router";
import { sanity } from "#/api/sanity";

interface SitemapUrl {
  url: string;
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
}

// mirrors the post client/config used by _app.blog(_.$slug) routes.
const POSTS_Q = `*[_type=="post" && defined(slug.current)]{
  "slug": slug.current, _updatedAt
} | order(_updatedAt desc)`;

// Static URLs based on your route configuration
const staticUrls: SitemapUrl[] = [
  { url: "/", changeFrequency: "daily", priority: 1.0 },
  { url: "/product", changeFrequency: "weekly", priority: 0.8 },
  { url: "/donation-forms", changeFrequency: "weekly", priority: 0.8 },
  { url: "/fund-management", changeFrequency: "weekly", priority: 0.8 },
  { url: "/fiscal-sponsorship", changeFrequency: "weekly", priority: 0.8 },
  { url: "/open-source", changeFrequency: "weekly", priority: 0.7 },
  { url: "/pricing", changeFrequency: "weekly", priority: 0.7 },
  { url: "/donor", changeFrequency: "weekly", priority: 0.8 },
  { url: "/donation-calculator", changeFrequency: "monthly", priority: 0.7 },
  { url: "/giving-tuesday", changeFrequency: "monthly", priority: 0.6 },
  { url: "/about-us", changeFrequency: "monthly", priority: 0.7 },
  { url: "/resources", changeFrequency: "monthly", priority: 0.6 },
  { url: "/blog", changeFrequency: "daily", priority: 0.8 },
  { url: "/marketplace", changeFrequency: "daily", priority: 0.9 },
  { url: "/fundraisers", changeFrequency: "daily", priority: 0.9 },
  { url: "/wp-plugin", changeFrequency: "monthly", priority: 0.6 },
  { url: "/privacy-policy", changeFrequency: "monthly", priority: 0.4 },
  { url: "/security-policy", changeFrequency: "monthly", priority: 0.4 },
  { url: "/terms-of-use", changeFrequency: "monthly", priority: 0.4 },
  { url: "/terms-of-use-npo", changeFrequency: "monthly", priority: 0.4 },
];

export const loader: LoaderFunction = async ({ request }) => {
  const base_url = new URL(request.url).origin;

  // static pages have no per-page mtime; request time is a valid ISO lastmod
  // and refreshes each crawl of the cached (max-age=3600) doc.
  const now = new Date().toISOString();

  let posts: { slug: string; _updatedAt: string }[] = [];
  try {
    posts = await sanity.fetch<{ slug: string; _updatedAt: string }[]>(POSTS_Q);
  } catch {
    // sanity outage must not break the whole sitemap; emit static urls only.
    posts = [];
  }

  const staticEntries = staticUrls
    .map(
      (url) => `  <url>
    <loc>${base_url}${url.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${url.changeFrequency}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
    )
    .join("\n");

  const postEntries = posts
    .map(
      (p) => `  <url>
    <loc>${base_url}/blog/${p.slug}</loc>
    <lastmod>${p._updatedAt}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
    )
    .join("\n");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[staticEntries, postEntries].filter(Boolean).join("\n")}
</urlset>`;

  return new Response(sitemap.trim(), {
    status: 200,
    headers: {
      "content-type": "application/xml",
      "cache-control": "public, max-age=3600",
    },
  });
};
