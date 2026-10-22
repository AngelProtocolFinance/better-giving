import { Image } from "@better-giving/ui";
import { ArrowUpRight } from "lucide-react";
import { useId } from "react";
import { Link } from "react-router";
import type { INpo } from "$/pg/queries/npo";
import { Socials } from "./socials";

export interface IOrgDetails {
  registration_number?: string | null;
  address?: string | null;
  active_in?: string | null;
}

interface IOrgFooter extends Pick<INpo, "social_media_urls"> {
  name: string;
  logo?: string | null;
  /** an "Organization details" row, when given; an empty field is left out */
  details?: IOrgDetails;
  classes?: string;
}

/** the org's mark, name and accounts, its details, then the platform credit */
export function OrgFooter({
  name,
  logo,
  social_media_urls,
  details,
  classes = "",
}: IOrgFooter) {
  const details_id = useId();
  const facts = details
    ? [
        { term: "EIN / Registration", value: details.registration_number },
        { term: "Address", value: details.address },
        { term: "Active in", value: details.active_in },
      ].filter((f) => f.value)
    : [];
  return (
    <footer className={`border-t bg-panel ${classes}`}>
      <div className="page flex flex-wrap items-center gap-3 pt-6 pb-2">
        {logo && (
          <Image
            src={logo}
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded-full border object-cover"
          />
        )}
        <span className="text-sm font-semibold">{name}</span>
        {/* a phone stacks them under the name, the glyphs (not their 44px
            targets) on the name's edge; wider screens push them right */}
        <Socials
          social_media_urls={social_media_urls}
          classes="empty:hidden max-sm:-ml-2.5 max-sm:basis-full sm:ml-auto"
        />
      </div>
      {facts.length > 0 && (
        <section
          aria-labelledby={details_id}
          className="page flex flex-col gap-2 pt-2 pb-6"
        >
          <h2
            id={details_id}
            className="text-xs font-bold uppercase tracking-badge text-gray-11"
          >
            Organization details
          </h2>
          <dl className="flex flex-wrap gap-x-7 gap-y-3 text-sm lg:gap-x-12">
            {facts.map((f) => (
              <div key={f.term} className="flex flex-col gap-1">
                <dt className="text-xs font-bold uppercase tracking-badge text-gray-11">
                  {f.term}
                </dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div className="page">
        <div className="flex border-t py-1">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-gray-11"
          >
            Powered by Better Giving
            <ArrowUpRight aria-hidden className="icon-xs" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
