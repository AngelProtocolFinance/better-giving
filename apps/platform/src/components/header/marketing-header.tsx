import { ArrowRight, MenuIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
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

const link_cls = (state: { isActive: boolean }) =>
  `text-sm font-medium ${nav_link_cls(state)}`;

interface IMarketingHeader {
  classes?: string;
}

export function MarketingHeader({ classes = "" }: IMarketingHeader) {
  const { session } = use_session();
  const [open, set_open] = useState(false);
  const close = () => set_open(false);
  const menu_id = useId();

  // optimistic-anon: treat loading as anon so CTAs render immediately
  const is_signed_in = !!session?.signed_in;

  return (
    <header className={`${classes} relative header-ground`}>
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
        <div className="hidden nav:flex items-center justify-end gap-3">
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
              <Link
                to={href("/register")}
                className="group btn btn-primary shadow-lift-cta gap-2"
              >
                Join free forever
                <ArrowRight
                  aria-hidden="true"
                  className="max-xl:hidden icon-sm transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link to={href("/login")} className="btn btn-secondary">
                Log In
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => set_open((o) => !o)}
          aria-label="Navigation menu"
          aria-expanded={open}
          aria-controls={menu_id}
          className="nav:hidden glyph-btn text-gray-12 focus-visible:outline-2 focus-visible:outline-ring"
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
              overhangs by the header height, and by the announcement banner's
              height too while the bar is visible and the page is unscrolled. */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            className="nav:hidden absolute inset-x-0 top-full h-[calc(100dvh_-_100%)] cursor-default bg-gray-12/40 backdrop-blur-sm"
          />
          <div
            id={menu_id}
            className="nav:hidden absolute inset-x-0 top-full bg-panel border-b shadow-floating"
          >
            {/* on `page`, so the labels start on the logo's edge. the open
                menu has the room the bar lacks, so the links take the
                editorial role rather than the bar's 14px. */}
            <nav aria-label="Marketing" className="page grid py-6">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={close}
                  className={(state) =>
                    `subsection-heading py-2 ${nav_link_cls(state)}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="grid gap-3 mt-6 pt-6 border-t">
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
                      className="group btn btn-lg btn-primary shadow-lift-cta gap-2"
                    >
                      Join free forever
                      <ArrowRight
                        aria-hidden="true"
                        className="icon-md transition-transform group-hover:translate-x-0.5"
                      />
                    </Link>
                    <Link
                      to={href("/login")}
                      onClick={close}
                      className="btn btn-lg btn-secondary"
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
