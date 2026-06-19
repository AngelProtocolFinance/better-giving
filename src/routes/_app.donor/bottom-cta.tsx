import { href, Link } from "react-router";
import laira_waiving from "#/assets/laira/laira-waiving.webp";
import { Image } from "#/components/image";

export function BottomCta({ className = "" }) {
  return (
    <div
      className={`${className} grid @5xl:grid-cols-2 bg-primary rounded @5xl:rounded ring-8 @md:ring-[1rem] ring-secondary px-10 py-12 @5xl:px-16 @5xl:py-18`}
    >
      <div className="grid order-2 @5xl:order-1">
        <h4 className="text-center @5xl:text-left uppercase @md:text-lg text-primary-fg leading-normal mb-6">
          Simple. Sustainable. Free.
        </h4>
        <h3 className="text-center @5xl:text-left @5xl:leading-snug  text-2xl @sm:text-4xl text-primary-fg mb-9">
          Together, we can change the world for good
        </h3>
        <Link
          to={href("/marketplace")}
          className="disabled:bg-muted aria-disabled:bg-muted text-primary border border-primary enabled:hover:border-primary justify-self-center @5xl:justify-self-start btn bg-card rounded px-8 py-3 @5xl:px-12 @5xl:py-6 @5xl:text-xl"
        >
          Donate today
        </Link>
      </div>
      <Image
        src={laira_waiving}
        className="place-self-center mb-8 order-1 @5xl:order-2"
      />
    </div>
  );
}
