import type { POSTS_QUERY_RESULT } from "blog-types";
import { useEffect, useState } from "react";
import { NavLink, useFetcher, useSearchParams } from "react-router";
import { CacheRoute, createClientLoaderCache } from "remix-client-cache";
import { posts } from "#/api/get/posts";
import { urlFor } from "#/api/sanity";
import { base_url } from "#/constants/env";
import { metas } from "#/helpers/seo";
import { CtaBand } from "#/pages/@sections/cta-band";
import type { IPostsPage } from "#/types/post";
import type { Route } from "./+types/route";

export const clientLoader = createClientLoaderCache<Route.ClientLoaderArgs>();
export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const currPage = +(url.searchParams.get("page") ?? "1");
  const [items, total] = await posts(currPage);
  const itemsPerPage = 10;

  const page: IPostsPage = {
    pageNum: currPage,
    posts: items,
    nextPageNum: currPage * itemsPerPage < total ? currPage + 1 : undefined,
  } satisfies IPostsPage;
  return page;
};

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = () =>
  metas({
    title: "Blog | Better Giving",
    description:
      "Practical guides on nonprofit fundraising, fund growth, and donation strategy from the Better Giving team.",
    // ?page=N is infinite-scroll pagination; canonicalize every page to /blog
    canonical: `${base_url}/blog`,
    url: `${base_url}/blog`,
  });

export { ErrorBoundary } from "#/components/error";
export default CacheRoute(Posts);
function Posts({ loaderData: firstPage }: Route.ComponentProps) {
  const [params] = useSearchParams();
  const { data, state, load } = useFetcher<typeof loader>();
  // seed from firstPage; both firstPage.posts and data.posts are the loader's
  // serialized post shape, so appends stay type-compatible.
  const [posts, setPosts] = useState<typeof firstPage.posts>(firstPage.posts);

  useEffect(() => {
    if (state !== "idle" || !data) return;
    setPosts((prev) => [...prev, ...data.posts]);
  }, [data, state]);

  const nextPage = data ? data.nextPageNum : firstPage.nextPageNum;

  return (
    <main>
      <section className="px-6 pt-16 pb-14 text-center bg-linear-to-b from-background to-accent">
        <p className="pre-heading">Blog &amp; Resources</p>
        <h1 className="hero-heading max-w-3xl mx-auto mt-3">
          Knowledge to empower your nonprofit
        </h1>
        <p className="section-body text-muted-fg max-w-2xl mx-auto mt-4">
          Practical guides on fundraising, fund growth, and the admin work
          nobody warned you about.
        </p>
      </section>

      <section className="bg-accent px-6 py-20">
        <div className="max-w-6xl mx-auto grid gap-8 md:grid-cols-2 lg:grid-cols-3 content-start">
          <Cards posts={posts} />
        </div>
        {nextPage && (
          <button
            type="button"
            className="btn btn-primary mx-auto mt-12 px-7 py-3.5"
            onClick={() => {
              const copy = new URLSearchParams(params);
              copy.set("page", nextPage.toString());
              load(`?${copy.toString()}`);
            }}
            disabled={state !== "idle"}
          >
            Load more
          </button>
        )}
      </section>

      <CtaBand
        title="Put these ideas to work"
        subtitle="Join free forever. Set up your donation form and start raising more this quarter."
      />
    </main>
  );
}

const Cards = (props: { posts: POSTS_QUERY_RESULT["items"] }) =>
  props.posts.map((post) => (
    <NavLink
      key={post._id}
      to={post.slug.current}
      className="grid [.pending]:grayscale grid-rows-[auto_1fr] h-full rounded-lg overflow-hidden bg-card border border-border hover:shadow-lg transition-shadow group"
    >
      {post.image?.asset ? (
        <img
          src={urlFor(post.image).width(1024).height(576).url()}
          alt={post.image.alt ?? post.title}
          className="w-full aspect-video object-cover"
        />
      ) : (
        <div className="w-full aspect-video bg-secondary" />
      )}
      <div className="flex flex-col p-6 gap-3">
        <h2 className="text-lg font-bold text-pretty group-has-[:hover]:text-primary">
          {post.title}
        </h2>
        {post.excerpt && (
          <p className="text-muted-fg line-clamp-4 text-pretty">
            {post.excerpt}
          </p>
        )}
      </div>
    </NavLink>
  ));
