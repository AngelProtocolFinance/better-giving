import type { MetaDescriptor } from "react-router";
import { app_name, base_url } from "#/constants/env";

interface Meta {
  title?: string;
  description?: string | null;
  name?: string;
  image?: string | null;
  url?: string;
  // og:type — "website" for most pages, "article" for blog posts. defaults "website".
  type?: "website" | "article";
  // self-referencing canonical. defaults to `url`; pass explicitly to strip
  // pagination/filter search params (e.g. /blog?page=2 -> /blog).
  canonical?: string;
  // json-ld structured data. each object is emitted as its own
  // <script type="application/ld+json"> via the { "script:ld+json" } descriptor.
  jsonld?: Record<string, unknown> | Record<string, unknown>[];
}

const og_default = `${base_url}/og-default.png`;

export const metas = ({
  title = `Fundraising Platform for Nonprofits - ${app_name}`,
  description = `Raise more this quarter and grow funds together. ${app_name} offers free, high-converting donation forms, savings, and fund growth tools—no platform or management fees.`,
  image = og_default,
  url = base_url,
  type = "website",
  canonical,
  jsonld,
}: Meta): MetaDescriptor[] => {
  const descriptors: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: canonical ?? url },
    { property: "og:site_name", content: app_name },
    { property: "og:url", content: url },
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: title },
    { property: "og:locale", content: "en_US" },
    { name: "twitter:card", content: "summary_large_image" },
    { property: "twitter:domain", content: url.replace(/^https?:\/\//, "") },
    { property: "twitter:url", content: url },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: title },
  ];

  // only assert dimensions for the known 1200x630 default; per-route images
  // (npo logos, banners) are arbitrary size — a wrong hint is worse than none.
  if (image === og_default) {
    descriptors.push(
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" }
    );
  }

  if (jsonld) {
    for (const obj of Array.isArray(jsonld) ? jsonld : [jsonld]) {
      descriptors.push({ "script:ld+json": obj });
    }
  }

  return descriptors;
};
