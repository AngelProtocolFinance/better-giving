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

  it("renders a scheme-less relative href as an anchor", async () => {
    const screen = await render_post(post_linking("#section"));
    await expect
      .element(screen.getByRole("link", { name: "this link" }))
      .toHaveAttribute("href", "#section");
  });

  it.each(["javascript:alert(1)", "data:text/html,x"])(
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

function post_with_cta(link1_href: string, link2_href: string): PostData {
  return {
    ...post_linking("https://better.giving"),
    cta: {
      eyebrow: null,
      heading: "Give today",
      body: null,
      image: null,
      link1: { label: "Donate", href: link1_href },
      link2: { label: "Learn more", href: link2_href },
    },
  };
}

describe("post cta links", () => {
  it("renders https hrefs as anchors", async () => {
    const screen = await render_post(
      post_with_cta(
        "https://better.giving/donate",
        "https://better.giving/about"
      )
    );
    await expect
      .element(screen.getByRole("link", { name: "Donate" }))
      .toHaveAttribute("href", "https://better.giving/donate");
    await expect
      .element(screen.getByRole("link", { name: "Learn more" }))
      .toHaveAttribute("href", "https://better.giving/about");
  });

  it("omits a button whose href is data:", async () => {
    const screen = await render_post(
      post_with_cta("data:text/html,x", "https://better.giving/about")
    );
    await expect.element(screen.getByText("Give today")).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "Learn more" }))
      .toBeVisible();
    expect(
      screen.container.querySelector('a[href^="data:"]'),
      "no data: anchor in the cta"
    ).toBeNull();
    expect(screen.container.textContent).not.toContain("Donate");
  });
});
