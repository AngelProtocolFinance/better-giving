import { MenuIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { href, Link, NavLink } from "react-router";
import { DappLogo } from "#/components/image";
import { use_session } from "#/hooks/use-session";
import { UserAvatar } from "./user-avatar";

const links = [
  { label: "Product", to: href("/product") },
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
    <header
      className={`${classes} relative bg-popover/95 backdrop-blur-md border-b`}
    >
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
            <Link to={href("/dashboard")}>
              <UserAvatar avatar={session?.avatar_url} classes="size-9" />
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

      {open && (
        <>
          {/* click-away catcher below the header bar */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={close}
            className="min-[75rem]:hidden absolute inset-x-0 top-full h-[100dvh] cursor-default"
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
