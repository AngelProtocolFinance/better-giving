import { PortableText, type PortableTextComponents } from "@portabletext/react";
import { ChevronLeft } from "lucide-react";
import { href, Link } from "react-router";
import { sanity, urlFor } from "#/api/sanity";
import { app_name, base_url } from "#/constants/env";
import { metas } from "#/helpers/seo";
import type { IPost } from "#/types/post";
import type { Route } from "./+types/route";

const container_style = "w-full px-5 max-w-4xl mx-auto pb-4";

const Q = `*[_type=="post" && slug.current==$slug][0]{
  _id, title, slug, publishedAt, _updatedAt, excerpt, image, body,
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
  const post_url = `${base_url}/blog/${d.slug.current}`;
  const image_url = d.image?.asset
    ? urlFor(d.image).width(1200).height(630).url()
    : undefined;

  const blog_posting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: d.title,
    datePublished: d.publishedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": post_url },
    publisher: {
      "@type": "Organization",
      name: app_name,
      logo: { "@type": "ImageObject", url: `${base_url}/logo.png` },
    },
  };
  if (d.excerpt) blog_posting.description = d.excerpt;
  if (image_url) blog_posting.image = image_url;
  if (d._updatedAt) blog_posting.dateModified = d._updatedAt;
  if (d.author?.name)
    blog_posting.author = { "@type": "Person", name: d.author.name };

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: base_url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${base_url}/blog`,
      },
      { "@type": "ListItem", position: 3, name: d.title, item: post_url },
    ],
  };

  return metas({
    title: `${d.title} | Better Giving Blog`,
    description: d.excerpt || undefined,
    image: image_url,
    type: "article",
    url: post_url,
    jsonld: [blog_posting, breadcrumbs],
  });
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
