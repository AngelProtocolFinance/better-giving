import type { MetaDescriptor } from "react-router";
import { app_name, base_url } from "#/constants/env";

interface Meta {
  title?: string;
  description?: string | null;
  name?: string;
  image?: string | null;
  url?: string;
}

export const metas = ({
  title = `Fundraising Platform for Nonprofits - ${app_name}`,
  description = `Raise more this quarter and grow funds together. ${app_name} offers free, high-converting donation forms, savings, and fund growth tools—no platform or management fees.`,
  image = `${base_url}/logo.png`,
  url = base_url,
}: Meta): MetaDescriptor[] => [
  { title },
  { name: "description", content: description },
  { property: "og:site_name", content: app_name },
  { property: "og:url", content: url },
  { property: "og:type", content: "website" },
  { property: "og:title", content: title },
  { property: "og:description", content: description },
  { property: "og:image", content: image },
  { name: "twitter:card", content: "summary_large_image" },
  { property: "twitter:domain", content: url.replace(/^https?:\/\//, "") },
  { property: "twitter:url", content: url },
  { name: "twitter:title", content: title },
  { name: "twitter:description", content: description },
  { name: "twitter:image", content: image },
];
