import type { POST_QUERY_RESULT } from "blog-types";
import { urlFor } from "#/api/sanity";
import { ExtLink } from "#/components/ext-link";

// editor-picked per post, so every field past heading/link1 is optional.
// shape defined in blog/schemaTypes/ctaType.ts.
type Cta = NonNullable<NonNullable<POST_QUERY_RESULT>["cta"]>;

interface IPostCta {
  cta: Cta;
}

export function PostCta({ cta }: IPostCta) {
  const img_url = cta.image?.asset ? urlFor(cta.image).width(560).url() : null;
  const heading_mb = cta.body ? "mb-6" : "mb-9";
  return (
    <div className="@container mt-12">
      <div
        className={`grid ${img_url ? "@5xl:grid-cols-2" : ""} bg-primary rounded ring-8 @md:ring-[1rem] ring-secondary px-10 py-12 @5xl:px-16 @5xl:py-18`}
      >
        <div className="grid order-2 @5xl:order-1">
          {cta.eyebrow && (
            <h4 className="text-center @5xl:text-left uppercase @md:text-lg text-primary-fg leading-normal mb-6">
              {cta.eyebrow}
            </h4>
          )}
          <h3
            className={`text-center @5xl:text-left @5xl:leading-snug text-2xl @sm:text-4xl text-primary-fg ${heading_mb}`}
          >
            {cta.heading}
          </h3>
          {cta.body && (
            <p className="text-center @5xl:text-left text-lg text-primary-fg/90 text-pretty mb-9">
              {cta.body}
            </p>
          )}
          <div className="flex flex-wrap gap-3.5 justify-center @5xl:justify-start">
            {cta.link1 && (
              <ExtLink
                href={cta.link1.href}
                className="text-primary border border-primary btn bg-card rounded px-8 py-3 @5xl:px-12 @5xl:py-6 @5xl:text-xl"
              >
                {cta.link1.label}
              </ExtLink>
            )}
            {cta.link2?.href && cta.link2.label && (
              <ExtLink
                href={cta.link2.href}
                className="btn rounded px-8 py-3 @5xl:px-12 @5xl:py-6 @5xl:text-xl border-2 border-primary-fg/40 text-primary-fg hover:bg-primary-fg/10"
              >
                {cta.link2.label}
              </ExtLink>
            )}
          </div>
        </div>
        {img_url && (
          <img
            src={img_url}
            alt={cta.image?.alt ?? ""}
            className="place-self-center mb-8 order-1 @5xl:order-2"
          />
        )}
      </div>
    </div>
  );
}
