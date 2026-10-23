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

/** a section of the page the header links to */
export interface IHeaderSection {
  /** the section's element id */
  id: string;
  label: string;
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
  /** in-page links to these sections, from lg; narrower screens get none
   * here, so a page that passes them carries its own strip there */
  sections?: IHeaderSection[];
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
  sections = [],
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
          <OrgMark name={name} logo={logo} size="sm" />
          <span className="truncate">{name}</span>
        </Link>
        {sections.length > 0 && (
          <nav aria-label="Sections" className="shrink-0 max-lg:hidden">
            <ul className="flex items-center">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="link inline-flex min-h-11 items-center px-3 font-semibold"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
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
