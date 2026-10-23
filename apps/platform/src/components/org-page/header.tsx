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
      ref={lift_when_stuck}
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
        <div className="flex shrink-0 items-center">
          {share && <Share trigger="icon" {...share} />}
          {bookmark && (
            <BookmarkBtn
              npo={bookmark}
              classes="size-11 text-primary hover:bg-secondary"
              idle_ink="text-primary"
            />
          )}
          {donate_to && (
            <Link
              to={donate_to}
              className="btn btn-primary ml-1 max-sm:px-4 sm:ml-2"
            >
              Donate
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** module-level, so its identity holds across renders and react runs it once
 * per mount, with the returned cleanup on unmount */
function lift_when_stuck(node: HTMLElement) {
  // -top-px sticks it one pixel above the viewport, so a stuck header is the
  // one no longer wholly in view
  const observer = new IntersectionObserver(
    ([e]) => {
      e.target.classList.toggle("shadow-floating", e.intersectionRatio < 1);
    },
    { threshold: [1] }
  );
  observer.observe(node);
  return () => observer.disconnect();
}
