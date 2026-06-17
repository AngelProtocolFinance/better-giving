import { href, NavLink } from "react-router";
import { urlFor } from "#/api/sanity";
import { ContentLoader } from "#/components/content-loader";
import type { IPostListItem } from "#/types/post";

export const BlogCard = (props: IPostListItem) => {
  return (
    <div className="relative hover:border-ring has-[.pending]:grayscale grid grid-rows-subgrid row-span-4 gap-3 pb-5 rounded bg-card">
      {props.image?.asset ? (
        <img
          src={urlFor(props.image).width(600).height(360).url()}
          alt={props.image.alt ?? props.title}
          className="rounded-t object-cover object-center w-full aspect-5/3"
        />
      ) : (
        <div className="rounded-t w-full aspect-5/3 bg-secondary" />
      )}
      <h3 className="font-semibold w-full text-xl line-clamp-2 px-6">
        {props.title}
      </h3>
      <p className="max-md:text-sm line-clamp-4 px-6 tracking-tighter text w-full">
        {props.excerpt}
      </p>
      <NavLink
        to={href("/blog/:slug", { slug: props.slug.current })}
        className="absolute inset-0"
        aria-label={props.title}
      />
      <NavLink
        to={href("/blog/:slug", { slug: props.slug.current })}
        className="z-10 justify-self-end mt-auto text-primary px-4 py-2 rounded font-semibold"
      >
        Read More
        <span className="sr-only">
          : {props.slug.current.replace(/-/g, " ")}
        </span>
      </NavLink>
    </div>
  );
};

export const Skeleton = () => (
  <div className="grid grid-rows-subgrid row-span-4 gap-3 pb-5 rounded bg-card">
    <ContentLoader className="w-full aspect-5/3 rounded-t" />
    <ContentLoader className="h-6 mx-6" />
    <ContentLoader className="h-16 mx-6" />
    <ContentLoader className="h-8 w-24 justify-self-end mr-6 mt-auto" />
  </div>
);
