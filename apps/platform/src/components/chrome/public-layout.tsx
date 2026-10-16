import { useCallback, useRef, useState } from "react";
import { href, Outlet, useLocation } from "react-router";
import { AnnouncementBanner, BANNER_POST_SLUG } from "./announcement-banner";
import { chrome_for, PublicFooter, PublicHeader } from "./public-chrome";

// the post the banner links to — the bar must not sit above the article it
// points at. derived from the component's own slug through the typed route
// helper, so a rename can't leave the two copies pointing at different urls.
const BANNER_TARGET = href("/blog/:slug", { slug: BANNER_POST_SLUG });

// shared shell for the pathless public layout wrappers (`_app`, `_landing`).
// header/footer resolve their intent bucket from the pathname via the chrome
// seam (see public-chrome.tsx).
export function PublicLayout() {
  const { pathname } = useLocation();
  const banner =
    chrome_for(pathname) === "marketing" &&
    pathname.replace(/\/+$/, "") !== BANNER_TARGET;
  const main_ref = useRef<HTMLDivElement>(null);

  // the mobile menu is open on the path it was opened on, so any navigation —
  // a link, back, a chrome bucket whose header has no menu — closes it, and
  // the inert below can never outlive the header that set it.
  const [menu_path, set_menu_path] = useState<string | null>(null);
  const menu_open = menu_path === pathname;
  const on_menu_open_change = useCallback(
    (open: boolean) => set_menu_path(open ? pathname : null),
    [pathname]
  );

  const focus_main = () => main_ref.current?.focus();

  return (
    // the row template tracks whether the banner renders: grid auto-placement
    // fills tracks in child order, so a fixed 4-track template with the banner
    // gated off would slide the header into the banner's row and the outlet
    // into the 4rem header row.
    //
    // the `4rem` / `calc(100dvh-4rem)` values are deliberately left as they
    // are, and that is a trade-off, not a no-op: the fold reference they encode
    // excludes the banner, so while the bar is visible the minimum document
    // height is `banner_h + 100dvh` and a short marketing page that used to end
    // exactly at the fold now carries the banner's height as dead scroll below
    // the footer.
    // `print:block` drops the grid on paper. viewport units resolve against the
    // page box when printing, so the `100dvh` minimum would reserve a full
    // sheet for the outlet whatever it contains — a page of white before the
    // content on anything printed from these routes.
    // the header pins: a sticky grid item is bounded by the grid container, not
    // its 4rem track, so it rides the whole page. `scroll-pt-16` is that 4rem,
    // set on the scroller (<html>) while this shell is mounted, so a `#id` jump
    // lands below the pinned header instead of under it. the banner scrolls
    // away and needs no padding.
    // while the mobile menu is open everything but the header is inert, which
    // is what keeps tab inside the menu. the `contents` wrappers carry it
    // without generating a box, so the track count above is unchanged; the
    // skip link is `fixed` and out of flow for the same reason.
    <div
      className={`grid grid-cols-[minmax(0,1fr)] [html:has(&)]:scroll-pt-16 print:block ${
        banner
          ? "grid-rows-[auto_4rem_minmax(calc(100dvh-4rem),1fr)_auto]"
          : "grid-rows-[4rem_minmax(calc(100dvh-4rem),1fr)_auto]"
      }`}
    >
      <a
        href="#main"
        inert={menu_open}
        className="not-focus:sr-only fixed top-2 left-2 z-top btn btn-secondary shadow-floating"
      >
        Skip to content
      </a>
      {banner && (
        <div className="contents" inert={menu_open}>
          <AnnouncementBanner on_dismissed={focus_main} />
        </div>
      )}
      {/* site navigation is not part of any printed document. sticky is worse
          than useless on paper: it lands the bar mid-sheet, in flow. */}
      <PublicHeader
        classes="sticky z-sticky -top-px print:hidden"
        menu_open={menu_open}
        on_menu_open_change={on_menu_open_change}
      />
      {/* the skip target. routes render their own <main>; this is the grid
          item in its place, a one-track grid so the route's root still
          stretches to the fold track as it did when it was the item. */}
      <div
        id="main"
        ref={main_ref}
        tabIndex={-1}
        inert={menu_open}
        className="grid grid-cols-[minmax(0,1fr)] outline-0"
      >
        <Outlet />
      </div>
      <div className="contents" inert={menu_open}>
        <PublicFooter />
      </div>
    </div>
  );
}
