import { wp } from "#/api/wp";
import type { IPost } from "#/types/wordpress";

export const posts = async (page: number): Promise<[IPost[], number]> => {
  const res = await wp((x, p) => {
    x.pathname = p("posts");
    x.searchParams.set("page", page.toString());
    return x;
  });

  const total = +(res.headers.get("x-wp-total") ?? "0");
  return [await res.json(), total] as const;
};
