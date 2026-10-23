import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { BookmarkBtn } from "#/components/bookmark-btn";
import { Share } from "#/routes/_app.fundraisers.$fund_id/share";
import type { INpoBookmark } from "#/types/user";
import { DonateButton } from "./donate";
import { OrgMark } from "./org-mark";

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
  /** the hero's own Donate. given, the header's Donate waits until it has
   * scrolled out of view, and leaves phones to the pinned bar; null while it
   * mounts. omitted, Donate always shows */
  donate_after?: Element | null;
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
  donate_after,
}: IOrgHeader) {
  const bar = useRef<HTMLDivElement>(null);
  // the watched element itself, while it is out of view: a new element starts
  // in view without a reset
  const [gone, set_gone] = useState<Element | null>(null);
  useEffect(() => {
    if (!donate_after) return;
    // the header pins over the page's top edge, so under it is out of view
    const under = bar.current?.offsetHeight ?? 0;
    const observer = new IntersectionObserver(
      ([e]) => set_gone(e.isIntersecting ? null : e.target),
      { rootMargin: `-${under}px 0px 0px 0px` }
    );
    observer.observe(donate_after);
    return () => observer.disconnect();
  }, [donate_after]);
  const watching = donate_after !== undefined;
  const show_donate =
    donate_to &&
    (!watching || (donate_after !== null && gone === donate_after));

  return (
    <header
      className="sticky -top-px z-sticky border-b bg-background"
      ref={lift_when_stuck}
    >
      <div
        ref={bar}
        className="page flex items-center gap-1 py-1 sm:gap-4 sm:py-2"
      >
        <Link
          to={to}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 font-bold text-gray-12 sm:gap-3"
        >
          {logo && <OrgMark name={name} logo={logo} size="sm" />}
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
          {show_donate && (
            <DonateButton
              to={donate_to}
              classes={`ml-1 max-sm:px-4 sm:ml-2 ${watching ? "max-md:hidden" : ""}`}
            />
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
