import type { POSTS_QUERY_RESULT } from "#/types/sanity.types";

// frontend view-model over the typegen'd list query; not a query result itself.
export interface IPostsPage {
  posts: POSTS_QUERY_RESULT["items"];
  pageNum: number;
  nextPageNum?: number;
}
