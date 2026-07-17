import { defineQuery } from "groq";
import { sanity } from "#/api/sanity";

const PAGE = 10;
const POSTS_QUERY = defineQuery(`{
  "items": *[_type=="post" && defined(slug.current)] | order(publishedAt desc)[$from...$to]{
    _id, title, slug, publishedAt, excerpt, image{asset, hotspot, crop, alt}, "authorName": author->name
  },
  "total": count(*[_type=="post" && defined(slug.current)])
}`);

export const posts = async (page: number) => {
  const from = (page - 1) * PAGE;
  const { items, total } = await sanity.fetch(POSTS_QUERY, {
    from,
    to: from + PAGE,
  });
  return [items, total] as const;
};
