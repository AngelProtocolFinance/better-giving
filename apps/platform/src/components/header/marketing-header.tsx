import { MenuIcon, XIcon } from "lucide-react";
import { useState } from "react";
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

const link_cls = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium ${isActive ? "text-primary" : "text-fg hover:text-primary"}`;

interface IMarketingHeader {
  classes?: string;
}

export function MarketingHeader({ classes = "" }: IMarketingHeader) {
  const { session } = use_session();
  const [open, set_open] = useState(false);
  const close = () => set_open(false);

  // optimistic-anon: treat loading as anon so CTAs render immediately
  const is_signed_in = !!session?.signed_in;

  return (
    <header className={`${classes} relative`}>
      {/* the chrome (bg + blur + border) sits on this full-bleed wrapper rather
          than on <header> for two reasons: `backdrop-filter` makes an element
          the containing block for its fixed-position descendants, which would
          trap the menu scrim inside the header box; and `z-10` here keeps the
          bar painted above that scrim without the scrim needing a z-index of
          its own. the inner div is the xl-capped content column, so the
          background can't live on it — it would stop short of the edges. */}
      <div className="relative z-10 bg-popover/95 backdrop-blur-md border-b">
        <div className="xl:container xl:mx-auto flex items-center justify-between gap-x-6 px-5 py-2">
          <DappLogo classes="h-12 w-auto shrink-0" />
          <nav
            aria-label="Marketing"
            className="hidden min-[75rem]:flex items-center gap-x-6"
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={link_cls}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          {/* fixed cta/avatar slot: anon->avatar swap doesn't shift the nav */}
          <div className="hidden min-[75rem]:flex items-center justify-end gap-3">
            {is_signed_in ? (
              <Link to={href("/dashboard")} className="contents">
                <UserAvatar avatar={session?.avatar_url} classes="size-7" />
              </Link>
            ) : (
              <>
                <Link
                  to={href("/register/welcome")}
                  className="btn btn-primary rounded-sm px-5 py-2.5 text-sm shadow-md shadow-primary/25"
                >
                  Join free forever
                </Link>
                <Link
                  to={href("/login")}
                  className="btn btn-secondary rounded-sm px-5 py-2.5 text-sm"
                >
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
            className="min-[75rem]:hidden text-fg"
          >
            {open ? <XIcon size={26} /> : <MenuIcon size={26} />}
          </button>
        </div>
      </div>

      {open && (
        <>
          {/* click-away catcher + scrim. `fixed` rather than `absolute
              top-full h-dvh`: an absolute box hung off the header's bottom
              edge always ran past the fold — by the header's own height once
              stuck, and by the announcement banner's height on top of that at
              scroll-top — and absolute boxes count toward scrollable overflow,
              so opening the menu added that much dead scroll below the footer.
              a fixed box contributes none, and covers exactly the viewport.
              it now spans the header too, but the bar's own background paints
              over it at z-10, so only the area below the header reads as
              scrimmed. */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            className="min-[75rem]:hidden fixed inset-0 cursor-default bg-fg/40 backdrop-blur-sm"
          />
          <div className="min-[75rem]:hidden absolute inset-x-0 top-full bg-popover border-b border-secondary shadow-lg">
            <nav aria-label="Marketing" className="grid gap-1 p-4">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  onClick={close}
                  className={({ isActive }) =>
                    `rounded px-4 py-2.5 text-sm font-medium hover:bg-secondary ${isActive ? "text-primary" : "text-fg"}`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
              <div className="my-2 h-px bg-border" />
              {is_signed_in ? (
                <Link
                  to={href("/dashboard")}
                  onClick={close}
                  className="rounded px-4 py-2.5 text-sm font-medium hover:bg-secondary text-fg"
                >
                  My Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to={href("/register/welcome")}
                    onClick={close}
                    className="btn btn-primary rounded-sm py-2.5 text-sm"
                  >
                    Join free forever
                  </Link>
                  <Link
                    to={href("/login")}
                    onClick={close}
                    className="btn btn-secondary rounded-sm py-2.5 text-sm"
                  >
                    Log In
                  </Link>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}
