import { Image } from "@better-giving/ui";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { INpo } from "$/pg/queries/npo";
import { Socials } from "./socials";

interface IOrgFooter extends Pick<INpo, "social_media_urls"> {
  name: string;
  logo?: string | null;
  classes?: string;
}

/** the org's mark, name and accounts, then the platform credit */
export function OrgFooter({
  name,
  logo,
  social_media_urls,
  classes = "",
}: IOrgFooter) {
  return (
    <footer className={`border-t bg-band ${classes}`}>
      <div className="page flex flex-wrap items-center gap-3 pt-6 pb-2">
        {logo && (
          <Image
            src={logo}
            alt=""
            width={28}
            height={28}
            className="size-7 shrink-0 rounded object-cover"
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
      <div className="page flex pb-4 sm:justify-center">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-gray-11"
        >
          Powered by Better Giving
          <ArrowUpRight aria-hidden className="icon-sm" />
        </Link>
      </div>
    </footer>
  );
}
