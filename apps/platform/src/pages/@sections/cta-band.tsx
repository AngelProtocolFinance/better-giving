import { ExtLink, Image } from "@better-giving/ui";
import { href, Link } from "react-router";
import laira_cheering from "#/assets/laira/laira-cheering.webp";
import { BOOK_A_DEMO } from "#/constants/urls";

interface ICtaBand {
  title: string;
  subtitle: string;
  classes?: string;
  /** the ask the page has been making — audience pages name their own */
  cta_label?: string;
}

export function CtaBand({
  title,
  subtitle,
  classes = "",
  cta_label = "Join free forever",
}: ICtaBand) {
  return (
    <section
      className={`${classes} relative overflow-hidden surface-primary px-6 py-20 md:py-28 text-center`}
    >
      <div className="absolute inset-0 dot-grid dot-grid-fade" aria-hidden />
      <div className="relative grid justify-items-center reveal">
        <span className="relative grid place-items-center">
          {/* a halo centred on Laira, spent before the heading starts, so the
              white copy keeps the fill's own contrast */}
          <span
            className="absolute size-72 bg-radial from-blue-8 to-transparent to-60%"
            aria-hidden
          />
          <Image src={laira_cheering} width={140} alt="" className="relative" />
        </span>
        <h2 className="section-heading max-w-2xl mt-6">{title}</h2>
        <p className="mt-5 text-lg text-primary-fg/90 max-w-xl text-pretty">
          {subtitle}
        </p>
        <div className="flex max-sm:flex-col max-sm:w-full sm:flex-wrap justify-center gap-3.5 mt-10">
          <Link to={href("/register")} className="btn btn-lg btn-secondary">
            {cta_label}
          </Link>
          <ExtLink href={BOOK_A_DEMO} className="btn btn-lg btn-outline">
            Book a demo
          </ExtLink>
        </div>
      </div>
    </section>
  );
}
