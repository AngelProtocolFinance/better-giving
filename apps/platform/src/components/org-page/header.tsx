import { Image } from "@better-giving/ui";
import { Link } from "react-router";
import { BookmarkBtn } from "#/components/bookmark-btn";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import type { INpoBookmark } from "#/types/user";

interface IShareTarget {
  recipientName: string;
  url: string;
}

interface IOrgHeader {
  name: string;
  logo?: string | null;
  /** the org's profile */
  to: string;
  bookmark?: INpoBookmark;
  /** a Share icon button for this target, when given */
  share?: IShareTarget;
  /** a Donate button to this href, when given */
  donate_to?: string;
}

/** the nonprofit's own masthead — its mark, not Better Giving's. it pins to
 * the top, and lifts once stuck */
export function OrgHeader({
  name,
  logo,
  to,
  bookmark,
  share,
  donate_to,
}: IOrgHeader) {
  return (
    <header
      className="sticky -top-px z-sticky border-b bg-background"
      ref={(node) => {
        if (!node) return;
        // -top-px leaves one pixel above the fold, so a stuck header is the
        // one no longer wholly in view
        const observer = new IntersectionObserver(
          ([e]) => {
            e.target.classList.toggle(
              "shadow-floating",
              e.intersectionRatio < 1
            );
          },
          { threshold: [1] }
        );
        observer.observe(node);
        return () => observer.disconnect();
      }}
    >
      <div className="page flex items-center gap-1 py-1 sm:gap-4 sm:py-2">
        <Link
          to={to}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 font-bold text-gray-12 sm:gap-3"
        >
          {logo && (
            <Image
              src={logo}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-full border object-cover"
            />
          )}
          <span className="truncate">{name}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {share && <Share trigger="icon" {...share} />}
          {bookmark && (
            <span className="grid size-11 place-items-center text-primary">
              <BookmarkBtn npo={bookmark} />
            </span>
          )}
          {donate_to && (
            <Link to={donate_to} className="btn btn-primary max-sm:ml-1">
              Donate
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
