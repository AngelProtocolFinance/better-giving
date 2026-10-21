import { href } from "react-router";

const SEGMENT_MAX = 30; // segment_shape's maxLength in lib/schemas
const EDGES = /^[-.]+|[-.]+$/g;

/** the link segment a campaign name suggests, kept inside `segment_shape`'s
 * charset, length and dot rules. an all-digit name still comes out id-like and
 * is left for the schema to refuse. */
export function link_from_name(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-._~]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(EDGES, "")
    .slice(0, SEGMENT_MAX)
    .replace(EDGES, "");
}

/** the public campaign link up to and including the slash before its slug */
export function campaign_link_base(origin: string, org: string) {
  return `${origin}${href("/org/:org", { org })}/`;
}
