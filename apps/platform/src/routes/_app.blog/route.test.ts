import { beforeEach, describe, expect, it, vi } from "vitest";

const posts = vi.hoisted(() => vi.fn(async () => [[], 0] as const));

vi.mock("#/api/get/posts", () => ({ PAGE_SIZE: 10, posts }));
vi.mock("#/api/sanity", () => ({ urlFor: vi.fn() }));

import { loader } from "./route";

const load = (page: string) =>
  loader({ request: new Request(`https://app.test/blog?page=${page}`) } as any);

beforeEach(() => {
  posts.mockClear();
});

describe("/blog loader ?page=", () => {
  it.each(["abc", "0", "-1", "1.5", ""])(
    "treats page=%s as page 1",
    async (page) => {
      const res = await load(page);
      expect(posts).toHaveBeenCalledWith(1);
      expect(res.pageNum).toBe(1);
    }
  );

  it("passes a positive integer page through", async () => {
    const res = await load("3");
    expect(posts).toHaveBeenCalledWith(3);
    expect(res.pageNum).toBe(3);
  });
});
