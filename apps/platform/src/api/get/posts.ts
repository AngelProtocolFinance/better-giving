import { POSTS_QUERY } from "blog-types";
import { href } from "react-router";
import { sanity } from "#/api/sanity";

export const PAGE_SIZE = 10;

export const posts = async (page: number) => {
  const from = (page - 1) * PAGE_SIZE;
  const { items, total } = await sanity.fetch(POSTS_QUERY, {
    from,
    to: from + PAGE_SIZE,
  });
  return [items, total] as const;
};

/** the post page's path, its slug encoded as one segment (slugs are studio
 * free text; `href` doesn't encode); null for a slug holding a lone surrogate,
 * which no url can carry */
export const post_path = (slug: string) => {
  let segment: string;
  try {
    segment = encodeURIComponent(slug);
  } catch {
    return null;
  }
  return href("/blog/:slug", { slug: segment });
};
