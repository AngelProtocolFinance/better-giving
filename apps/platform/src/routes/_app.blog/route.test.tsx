import { createRoutesStub, Link } from "react-router";
import { configureGlobalCache } from "remix-client-cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Route } from "./+types/route";

const posts_mock = vi.hoisted(() => vi.fn());
vi.mock("#/api/get/posts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/api/get/posts")>()),
  posts: posts_mock,
}));

import BlogRoute, { clientLoader, loader } from "./route";

// the client cache is module state keyed by url; a fresh one per test keeps
// each test's first visit cold whatever ran before it.
const cache_set = vi.fn();
beforeEach(() => {
  const store = new Map<string, unknown>();
  cache_set.mockReset();
  configureGlobalCache(() => ({
    getItem: async (key: string) => store.get(key),
    setItem: async (key: string, val: unknown) => {
      store.set(key, val);
      cache_set(key, val);
    },
    removeItem: async (key: string) => store.delete(key),
  }));
});

const post = (id: string, title: string, slug = id) => ({
  _id: id,
  title,
  slug: { current: slug },
  excerpt: null,
  image: null,
});

// the route's real client cache in front of its real server loader, as the
// framework wires them.
const stub_loader = (args: { request: Request; params: object }) =>
  clientLoader({
    ...args,
    serverLoader: () => loader(args as Route.LoaderArgs),
  } as unknown as Route.ClientLoaderArgs);

const Stub = createRoutesStub([
  { path: "/blog", Component: BlogRoute as any, loader: stub_loader },
  {
    path: "/blog/:slug",
    Component: () => <Link to="/blog">back to blog</Link>,
  },
]);

describe("blog list", () => {
  test("returning to /blog shows the posts the server revalidated, not the cached list", async () => {
    posts_mock.mockResolvedValue([[post("a", "Old post")], 1]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    await screen.getByRole("link", { name: /old post/i }).click();

    posts_mock.mockResolvedValue([
      [post("b", "Fresh post"), post("a", "Old post")],
      2,
    ]);
    await screen.getByRole("link", { name: /back to blog/i }).click();

    await expect
      .element(screen.getByRole("link", { name: /fresh post/i }))
      .toBeVisible();
  });

  test("a url-shaped slug links to a post path under /blog, never off-site", async () => {
    posts_mock.mockResolvedValue([[post("x", "Tricky", "//evil.com")], 1]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    await expect
      .element(screen.getByRole("link", { name: /tricky/i }))
      .toHaveAttribute("href", "/blog/%2F%2Fevil.com");
  });

  test("a card whose image ref the url builder can't parse renders without an image", async () => {
    posts_mock.mockResolvedValue([
      [
        {
          ...post("m", "Malformed image"),
          image: { asset: { _ref: "image-nope", _type: "reference" } },
        },
      ],
      1,
    ]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    const card = screen.getByRole("link", { name: /malformed image/i });
    await expect.element(card).toBeVisible();
    expect(card.element().querySelector("img")).toBeNull();
  });

  test("a post slug with url metacharacters links to its encoded path", async () => {
    posts_mock.mockResolvedValue([[post("t", "Tips", "tips & <tricks>")], 1]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    await expect
      .element(screen.getByRole("link", { name: /tips/i }))
      .toHaveAttribute("href", "/blog/tips%20%26%20%3Ctricks%3E");
  });

  test("a post slug no url can carry drops its card, not the list", async () => {
    posts_mock.mockResolvedValue([
      [post("s", "Surrogate", "bad-\uD800"), post("k", "Kept post")],
      2,
    ]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    await expect
      .element(screen.getByRole("link", { name: /kept post/i }))
      .toBeVisible();
    expect(screen.getByText("Surrogate").query()).toBeNull();
  });

  test.each([
    "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg",
    "image-abc_DEF-100x100-png",
  ])("a card with image ref %s renders its image", async (ref) => {
    posts_mock.mockResolvedValue([
      [
        {
          ...post("v", "Valid image"),
          image: { asset: { _ref: ref, _type: "reference" } },
        },
      ],
      1,
    ]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    const card = screen.getByRole("link", { name: /valid image/i });
    await expect.element(card).toBeVisible();
    const img = card.element().querySelector("img");
    expect(img?.getAttribute("src")).toMatch(/^https:\/\/cdn\.sanity\.io\//);
  });

  test("a card names its link once: the cover is decorative beside the title", async () => {
    posts_mock.mockResolvedValue([
      [
        {
          ...post("d", "Donor guide"),
          image: {
            asset: {
              _ref: "image-abc_DEF-100x100-png",
              _type: "reference",
            },
            alt: "Chart of donations",
          },
        },
      ],
      1,
    ]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    await expect
      .element(screen.getByRole("link", { name: "Donor guide", exact: true }))
      .toBeVisible();
  });

  test.each([
    ["an empty crop", { crop: {} }],
    ["a hotspot with a missing field", { hotspot: { x: 0.5, y: 0.5 } }],
  ])("a card whose image has %s renders without an image", async (_, extra) => {
    posts_mock.mockResolvedValue([
      [
        {
          ...post("c", "Broken crop"),
          image: {
            asset: {
              _ref: "image-Tb9Ew8CXIwaY6R1kjMvI0uRR-2000x3000-jpg",
              _type: "reference",
            },
            ...extra,
          },
        },
      ],
      1,
    ]);
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    const card = screen.getByRole("link", { name: /broken crop/i });
    await expect.element(card).toBeVisible();
    expect(card.element().querySelector("img")).toBeNull();
  });

  test("pages loaded with load more survive a revalidation that changed nothing", async () => {
    const first_page = () => [[post("a", "First post")], 11] as const;
    posts_mock.mockResolvedValue(first_page());
    const screen = await render(<Stub initialEntries={["/blog"]} />);
    await screen.getByRole("link", { name: /first post/i }).click();

    let release_revalidation = () => {};
    posts_mock.mockImplementation((page: number) =>
      page === 2
        ? Promise.resolve([[post("c", "Second page post")], 11])
        : new Promise((resolve) => {
            release_revalidation = () => resolve(first_page());
          })
    );
    await screen.getByRole("link", { name: /back to blog/i }).click();
    await screen.getByRole("button", { name: /load more/i }).click();
    await expect
      .element(screen.getByRole("link", { name: /second page post/i }))
      .toBeVisible();

    release_revalidation();
    // the cache write sits beside the fresh-data state update; one task later,
    // react has rendered it
    await vi.waitFor(() =>
      expect(cache_set).toHaveBeenCalledWith(
        "/blog",
        expect.objectContaining({
          posts: [expect.objectContaining({ _id: "a" })],
        })
      )
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(
      screen.getByRole("link", { name: /second page post/i }).query()
    ).not.toBeNull();
  });
});
