import { sanity } from "#/api/sanity";
import type { IPostListItem } from "#/types/post";

const PAGE = 10;
const Q = `{
  "items": *[_type=="post" && defined(slug.current)] | order(publishedAt desc)[$from...$to]{
    _id, title, slug, publishedAt, excerpt, image, "authorName": author->name
  },
  "total": count(*[_type=="post" && defined(slug.current)])
}`;

export const posts = async (
  page: number
): Promise<[IPostListItem[], number]> => {
  const from = (page - 1) * PAGE;
  const { items, total } = await sanity.fetch<{
    items: IPostListItem[];
    total: number;
  }>(Q, { from, to: from + PAGE });
  return [items, total];
};
