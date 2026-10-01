import type { POST_QUERY_RESULT } from "blog-types";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { base_url } from "#/constants/env";
import Post, { meta } from "./route";

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

const span = (text: string, marks: string[] = []) => ({
  _type: "span",
  _key: text,
  text,
  marks,
});
const block = (key: string, children: object[], markDefs: object[] = []) => ({
  _type: "block",
  _key: key,
  style: "normal",
  markDefs,
  children,
});
// written around the studio (api token, migration); the url builder throws on it
const bad_image = {
  _type: "image",
  asset: { _ref: "image-nope", _type: "reference" },
};

const malformed_post = (body: object[], extra: object = {}) =>
  ({
    ...post_linking("https://better.giving"),
    body,
    ...extra,
  }) as unknown as PostData;

describe("malformed post data", () => {
  it("renders image refs the url builder can't parse as no image", async () => {
    const screen = await render_post(
      malformed_post(
        [
          block("b1", [span("Body text survives")]),
          { ...bad_image, _key: "i1" },
        ],
        {
          image: bad_image,
          cta: {
            eyebrow: null,
            heading: "Cta heading",
            body: null,
            image: bad_image,
            link1: { href: "https://better.giving", label: "Go" },
            link2: null,
          },
        }
      )
    );
    await expect.element(screen.getByText("Body text survives")).toBeVisible();
    await expect.element(screen.getByText("Cta heading")).toBeVisible();
    expect(screen.container.querySelectorAll("img").length).toBe(0);
  });

  it("renders the text of a mark, type, style or list named after an Object.prototype key", async () => {
    const screen = await render_post(
      malformed_post([
        block("b1", [span("Decorated text", ["constructor"])]),
        block(
          "b2",
          [span("Annotated text", ["k1"])],
          [{ _key: "k1", _type: "toString" }]
        ),
        { _type: "constructor", _key: "c1" },
        { ...block("b3", [span("Odd style text")]), style: "constructor" },
        {
          ...block("b4", [span("Odd list text")]),
          listItem: "toString",
          level: 1,
        },
        block("b5", [span("After the odd block")]),
      ])
    );
    await expect.element(screen.getByText("Decorated text")).toBeVisible();
    await expect.element(screen.getByText("Annotated text")).toBeVisible();
    await expect.element(screen.getByText("Odd style text")).toBeVisible();
    await expect.element(screen.getByText("Odd list text")).toBeVisible();
    await expect.element(screen.getByText("After the odd block")).toBeVisible();
  });
});

const valid_image = {
  _type: "image",
  asset: {
    _ref: "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg",
    _type: "reference",
  },
};

describe("post images", () => {
  it("renders a valid image ref as an img, in the hero and the body", async () => {
    const screen = await render_post(
      malformed_post(
        [
          block("b1", [span("Body text")]),
          { ...valid_image, _key: "i1", alt: "Body image" },
        ],
        { image: { ...valid_image, alt: "Hero image" } }
      )
    );
    for (const name of ["Hero image", "Body image"]) {
      await expect
        .element(screen.getByRole("img", { name }))
        .toHaveAttribute(
          "src",
          expect.stringMatching(/^https:\/\/cdn\.sanity\.io\//)
        );
    }
  });
});

describe("post list items", () => {
  it("renders a block whose listItem isn't a string as a paragraph", async () => {
    const screen = await render_post(
      malformed_post([
        { ...block("b1", [span("Null list text")]), listItem: null, level: 1 },
      ])
    );
    const text = screen.getByText("Null list text");
    await expect.element(text).toBeVisible();
    expect(text.element().closest("li")).toBeNull();
  });
});

describe("post meta", () => {
  it("points canonical, og, twitter and json-ld at the encoded post path", () => {
    const post = {
      ...post_linking("https://better.giving"),
      slug: { _type: "slug", current: "tips & <tricks>" },
    } as PostData;
    const descriptors = meta({ loaderData: post } as any) as Record<
      string,
      any
    >[];
    const url = `${base_url}/blog/tips%20%26%20%3Ctricks%3E`;

    const canonical = descriptors.find((d) => d.rel === "canonical");
    expect(canonical?.href).toBe(url);
    const content_of = (key: string) =>
      descriptors.find((d) => d.property === key)?.content;
    expect(content_of("og:url")).toBe(url);
    expect(content_of("twitter:url")).toBe(url);

    const [posting, breadcrumbs] = descriptors
      .filter((d) => "script:ld+json" in d)
      .map((d) => d["script:ld+json"]);
    expect(posting.mainEntityOfPage["@id"]).toBe(url);
    expect(breadcrumbs.itemListElement[2].item).toBe(url);
  });
});
