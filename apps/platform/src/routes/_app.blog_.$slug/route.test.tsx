import type { POST_QUERY_RESULT } from "blog-types";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import Post from "./route";

type PostData = NonNullable<POST_QUERY_RESULT>;

function post_linking(href: string): PostData {
  return {
    _id: "post-1",
    title: "A post",
    slug: { _type: "slug", current: "a-post" },
    publishedAt: "2026-09-01T00:00:00Z",
    _updatedAt: "2026-09-01T00:00:00Z",
    excerpt: null,
    image: null,
    author: { name: "Ada", image: null },
    cta: null,
    body: [
      {
        _type: "block",
        _key: "b1",
        style: "normal",
        markDefs: [{ _type: "link", _key: "l1", href }],
        children: [
          { _type: "span", _key: "s1", marks: [], text: "Read " },
          { _type: "span", _key: "s2", marks: ["l1"], text: "this link" },
        ],
      },
    ],
  };
}

function render_post(post: PostData) {
  const Stub = createRoutesStub([
    {
      path: "/blog/:slug",
      loader: () => post,
      Component: Post,
      HydrateFallback: () => null,
    },
    { path: "/blog", Component: () => null },
  ]);
  return render(<Stub initialEntries={["/blog/a-post"]} />);
}

describe("post body links", () => {
  it("renders an allowed href as an anchor", async () => {
    const screen = await render_post(post_linking("https://better.giving"));
    await expect
      .element(screen.getByRole("link", { name: "this link" }))
      .toHaveAttribute("href", "https://better.giving");
  });

  it.each(["javascript:alert(1)", "//evil.com", "blog/x"])(
    "renders %j as plain text with no anchor",
    async (href) => {
      const screen = await render_post(post_linking(href));
      await expect.element(screen.getByText("this link")).toBeVisible();
      expect(
        screen.container.querySelector(".prose a"),
        "no anchor in the post body"
      ).toBeNull();
    }
  );
});
