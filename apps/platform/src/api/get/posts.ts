import { POSTS_QUERY } from "blog-types";
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
