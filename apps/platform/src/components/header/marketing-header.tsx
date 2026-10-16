import { ArrowRight, MenuIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { href, Link, NavLink } from "react-router";
import { DappLogo } from "#/components/image";
import { use_session } from "#/hooks/use-session";
import { UserAvatar } from "./user-avatar";

const links = [
  { label: "Donation Processing", to: href("/product") },
  { label: "Fund Management", to: href("/fund-management") },
  { label: "Fiscal Sponsorship", to: href("/fiscal-sponsorship") },
  { label: "Open Source", to: href("/open-source") },
  { label: "Pricing", to: href("/pricing") },
  { label: "About", to: href("/about-us") },
] as const;

// the current item keeps the brand ink and adds a 2px underline in that same
// ink: ink alone is one blue word in a row of dark ones, which reads as
// a hover that stuck. a hover is the ink shift and nothing else, so the
// underline stays the current page's alone.
const nav_link_cls = ({ isActive }: { isActive: boolean }) =>
  `transition-colors ${isActive ? "text-primary underline decoration-2 underline-offset-8" : "text-gray-12 hover:text-primary"}`;

// py-0.5 lifts the 20px line box to the 24px target floor; the row is the
// logo's height, so the label's box grows inside it without moving.
const link_cls = (state: { isActive: boolean }) =>
  `text-sm font-medium py-0.5 ${nav_link_cls(state)}`;

interface IMarketingHeader {
  classes?: string;
  /** held by the layout, which inerts everything outside the header while the
   *  menu is open */
  menu_open: boolean;
  on_menu_open_change: (open: boolean) => void;
}

export function MarketingHeader({
  classes = "",
  menu_open: open,
  on_menu_open_change,
}: IMarketingHeader) {
  const { session } = use_session();
  const menu_id = useId();
  const header_ref = useRef<HTMLElement>(null);
  const toggle_ref = useRef<HTMLButtonElement>(null);
  const first_link_ref = useRef<HTMLAnchorElement>(null);

  const close = () => on_menu_open_change(false);
  // a close that doesn't navigate hands focus back to the control that opened
  // the menu; a link's close leaves it to the navigation.
  const dismiss = () => {
    close();
    toggle_ref.current?.focus();
  };

  const toggle = () => {
    // the panel is capped to the viewport under a header pinned at the top.
    // while the announcement bar still holds the header lower, that cap would
    // overhang the fold by the bar's height, so opening pins the header first
    // (`-top-px` is where it sticks).
    const top = header_ref.current?.getBoundingClientRect().top ?? 0;
    if (!open && top > 0)
      window.scrollBy({ top: top + 1, behavior: "instant" });
    on_menu_open_change(!open);
  };

  // disclosure-nav focus: into the panel on open. tab stays inside because the
  // layout inerts the page behind it.
  useEffect(() => {
    if (open) first_link_ref.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const on_key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      on_menu_open_change(false);
      toggle_ref.current?.focus();
    };
    // the toggle is `nav:hidden`, and the panel with it: once the window
    // widens past the breakpoint nothing is open on screen, but the layout
    // would keep the page inert.
    const on_resize = () => {
      if (toggle_ref.current?.getClientRects().length === 0) {
        on_menu_open_change(false);
      }
    };
    document.addEventListener("keydown", on_key);
    window.addEventListener("resize", on_resize);
    return () => {
      document.removeEventListener("keydown", on_key);
      window.removeEventListener("resize", on_resize);
    };
  }, [open, on_menu_open_change]);

  // optimistic-anon: treat loading as anon so CTAs render immediately
  const is_signed_in = !!session?.signed_in;

  return (
    // an opaque bar on the page's own fill at rest and scrolled alike: no
    // translucency, no blur, no hairline, no shadow (ledger → "Marketing house
    // rules"). the open menu panel below floats, so it keeps its level.
    <header ref={header_ref} className={`${classes} relative bg-background`}>
      {/* the row carries a logo, six labels and two ctas, and at the 75rem
          `nav` breakpoint it fills the 1120px content box to within a few px:
          that is why the nav collapses at 75rem rather than at a breakpoint
          name, and why below xl the label gap steps down and the cta's arrow
          is left off — with both, the labels wrap to two lines up to ~1235px.
          the row sits on the same `page` shape as the sections below it, so
          the logo's left edge and the first heading's line up. */}
      <div className="page flex items-center justify-between gap-x-6 py-2">
        {/* shrink-0 belongs on the flex item, and DappLogo's own classes land
            on the <img> inside its <a> — without this the anchor shrinks and
            object-contain letterboxes the mark. */}
        <div className="shrink-0">
          <DappLogo classes="h-12 w-auto" />
        </div>
        <nav
          aria-label="Marketing"
          className="hidden nav:flex items-center gap-x-5 xl:gap-x-6"
        >
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={link_cls}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        {/* fixed cta/avatar slot: anon->avatar swap doesn't shift the nav */}
        <div className="hidden nav:flex items-center justify-end gap-5">
          {is_signed_in ? (
            <Link
              to={href("/dashboard")}
              aria-label="Your dashboard"
              className="contents"
            >
              <UserAvatar avatar={session?.avatar_url} classes="size-7" />
            </Link>
          ) : (
            <>
              {/* one button: the sign-in is a nav-ink link beside it */}
              <Link
                to={href("/login")}
                className={link_cls({ isActive: false })}
              >
                Log In
              </Link>
              <Link
                to={href("/register")}
                className="group btn btn-primary gap-2"
              >
                Join free forever
                <ArrowRight
                  aria-hidden="true"
                  className="max-xl:hidden icon-sm transition-transform motion-safe:group-hover:translate-x-0.5"
                />
              </Link>
            </>
          )}
        </div>
        {/* min-*-11 is the 44px hit area around the 24px glyph; -me-2.5 keeps
            the glyph on the gutter edge the 24px box put it on. */}
        <button
          ref={toggle_ref}
          type="button"
          onClick={toggle}
          aria-label="Navigation menu"
          aria-expanded={open}
          aria-controls={menu_id}
          className="nav:hidden glyph-btn min-w-11 min-h-11 -me-2.5 text-gray-12 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {open ? (
            <XIcon className="icon-2xl" />
          ) : (
            <MenuIcon className="icon-2xl" />
          )}
        </button>
      </div>

      {open && (
        <>
          {/* click-away catcher + scrim below the header bar. height is a
              viewport minus the header's own box (`100%` resolves against the
              containing block, i.e. this header) so the scrim ends exactly at
              the fold when the header is stuck — `h-dvh` from `top-full`
              overhangs by the header height. a pointer's close only: it is no
              tab stop, since Escape and the toggle close it from the keyboard. */}
          <div
            aria-hidden="true"
            onClick={dismiss}
            className="nav:hidden absolute inset-x-0 top-full h-[calc(100dvh_-_100%)] cursor-default bg-gray-12/40"
          />
          {/* the same cap as the scrim, so a menu taller than a short or
              zoomed viewport scrolls inside itself instead of running past
              the fold of a page that is pinned under it. */}
          <div
            id={menu_id}
            className="nav:hidden absolute inset-x-0 top-full max-h-[calc(100dvh_-_100%)] overflow-y-auto overscroll-contain scrollbars bg-panel border-b shadow-floating"
          >
            {/* on `page`, so the labels start on the logo's edge. the open
                menu has the room the bar lacks, so the links take the
                editorial role rather than the bar's 14px. */}
            <nav aria-label="Marketing" className="page grid py-6">
              {links.map((l, i) => (
                <NavLink
                  key={l.to}
                  ref={i === 0 ? first_link_ref : undefined}
                  to={l.to}
                  onClick={close}
                  className={(state) =>
                    `subsection-heading py-2 ${nav_link_cls(state)}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="grid gap-3 mt-8">
                {is_signed_in ? (
                  <Link
                    to={href("/dashboard")}
                    onClick={close}
                    className="btn btn-lg btn-secondary"
                  >
                    My Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to={href("/register")}
                      onClick={close}
                      className="group btn btn-lg btn-primary gap-2"
                    >
                      Join free forever
                      <ArrowRight
                        aria-hidden="true"
                        className="icon-md transition-transform motion-safe:group-hover:translate-x-0.5"
                      />
                    </Link>
                    {/* min-h-11 is the 44px target the button above it has */}
                    <Link
                      to={href("/login")}
                      onClick={close}
                      className={`justify-self-center inline-flex items-center min-h-11 px-3 text-lg font-medium ${nav_link_cls({ isActive: false })}`}
                    >
                      Log In
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
