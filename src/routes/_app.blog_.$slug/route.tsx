import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { ChevronLeft } from "lucide-react";
import { href, Link } from "react-router";
import { sanity, urlFor } from "#/api/sanity";
import { metas } from "#/helpers/seo";
import type { IPost } from "#/types/post";
import type { Route } from "./+types/route";

const container_style = "w-full px-5 max-w-4xl mx-auto pb-4";

const Q = `*[_type=="post" && slug.current==$slug][0]{
  _id, title, slug, publishedAt, excerpt, image, body,
  author->{name, image}
}`;

export const loader = async ({ params }: Route.LoaderArgs) => {
  const post = await sanity.fetch<IPost | null>(Q, { slug: params.slug });
  if (!post) throw new Response("Not Found", { status: 404 });
  return post;
};

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  if (!d) return [];
  return metas({ title: d.title });
};

export { ErrorBoundary } from "#/components/error";

const ptComponents: PortableTextComponents = {
  types: {
    image: ({ value }) =>
      value?.asset ? (
        <figure className="my-6">
          <img
            src={urlFor(value).width(900).url()}
            alt={value.alt ?? ""}
            className="rounded"
          />
          {value.caption && (
            <figcaption className="mt-2 text-center text-sm text-muted-fg">
              {value.caption}
            </figcaption>
          )}
        </figure>
      ) : null,
  },
};

export default function Post({ loaderData: post }: Route.ComponentProps) {
  const heroUrl = post.image?.asset
    ? urlFor(post.image).width(900).height(500).url()
    : null;
  return (
    <div className={container_style}>
      <Link
        to={href("/blog")}
        className="flex items-center gap-2 font-medium text-primary hover:text-primary mt-6"
      >
        <ChevronLeft className="text-[1em]" />
        <span>Go Back</span>
      </Link>
      {heroUrl ? (
        <img
          src={heroUrl}
          alt={post.image?.alt ?? post.title}
          className="relative w-full aspect-9/5 object-cover object-top mt-4 rounded"
        />
      ) : (
        <div className="w-full aspect-9/5 mt-4 rounded bg-secondary" />
      )}
      <h1 className="text-xl md:text-2xl lg:text-3xl my-8 text-pretty">
        {post.title}
      </h1>

      <p className="text-sm mt-8 text-muted-fg">
        Posted:{" "}
        {new Date(post.publishedAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
      {post.author?.name && (
        <p className="text-muted-fg text-sm">Author: {post.author.name}</p>
      )}
      <div className="w-full h-px bg-muted my-4" />

      <div className="prose lg:prose-lg prose-a:text-primary hover:prose-a:text-primary">
        {Array.isArray(post.body) && (
          <PortableText value={post.body} components={ptComponents} />
        )}
      </div>
    </div>
  );
}
