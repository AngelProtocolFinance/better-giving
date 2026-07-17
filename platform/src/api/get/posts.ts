import { POSTS_QUERY } from "blog-types";
import { sanity } from "#/api/sanity";

const PAGE = 10;

export const posts = async (page: number) => {
  const from = (page - 1) * PAGE;
  const { items, total } = await sanity.fetch(POSTS_QUERY, {
    from,
    to: from + PAGE,
  });
  return [items, total] as const;
};
