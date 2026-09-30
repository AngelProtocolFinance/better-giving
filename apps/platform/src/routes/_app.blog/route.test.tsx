import { createRoutesStub, Link } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { Route } from "./+types/route";

const posts_mock = vi.hoisted(() => vi.fn());
vi.mock("#/api/get/posts", () => ({ posts: posts_mock }));

import BlogRoute, { clientLoader, loader } from "./route";

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
});
