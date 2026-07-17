import { defineQuery } from "groq";

// blog owns the groq. `sanity typegen` scans this file (schema.json x these
// queries) -> emits result types + the @sanity/client overload into the
// `blog-types` package. these consts are ALSO emitted verbatim into that
// package (see typegen script) so platform can run them at fetch time without
// importing blog. edit here only; the package copy is a build artifact.

export const POSTS_QUERY = defineQuery(`{
  "items": *[_type=="post" && defined(slug.current)] | order(publishedAt desc)[$from...$to]{
    _id, title, slug, publishedAt, excerpt, image{asset, hotspot, crop, alt}, "authorName": author->name
  },
  "total": count(*[_type=="post" && defined(slug.current)])
}`);

export const POST_QUERY =
  defineQuery(`*[_type=="post" && slug.current==$slug][0]{
  _id, title, slug, publishedAt, _updatedAt, excerpt, image, body,
  author->{name, image},
  cta->{eyebrow, heading, body, image, link1, link2}
}`);
