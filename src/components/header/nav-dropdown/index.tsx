import { Menu } from "@base-ui/react/menu";
import {
  BadgeCheck,
  GlobeIcon,
  LayoutGrid,
  LibraryIcon,
  MegaphoneIcon,
  MenuIcon,
  PanelsTopLeftIcon,
  SproutIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { href, NavLink } from "react-router";
import bg_logo from "#/assets/images/bg-logo.webp";
import type { PublicUser } from "#/types/auth";
import { UserAvatar } from "../user-avatar";
import { UserMenu } from "../user-menu";
import { styler } from "./common";

interface Props {
  auth_links: ReactNode | undefined;
  user: PublicUser | undefined;
  classes?: string;
}

export function NavDropdown({ user, auth_links, classes = "" }: Props) {
  return (
    <Menu.Root>
      <Menu.Trigger
        data-testid="nav_dropdown"
        className={`group flex items-center gap-x-2 ${classes}`}
        aria-label="Navigation Menu"
        openOnHover={false}
      >
        {user && (
          <UserAvatar
            avatar={user.avatar_url}
            classes="peer group-data-popup-open:invisible"
          />
        )}
        <div className="peer-hover:text-primary hover:text-primary group-data-popup-open:rotate-90 transition-transform ease-in-out">
          <MenuIcon
            size={24}
            className="group-data-popup-open:hidden"
            aria-hidden="true"
          />
          <XIcon
            size={24}
            className="hidden group-data-popup-open:block"
            aria-hidden="true"
          />
        </div>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner
          side="bottom"
          align="end"
          sideOffset={15}
          className="z-40"
        >
          <Menu.Popup
            render={<nav />}
            className="relative grid grid-cols-[auto_1fr] isolate z-40 rounded bg-popover drop-shadow-2xl origin-top transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0"
          >
            <div className="self-start">
              <Menu.Group className="grid grid-cols-[auto_1fr] gap-y-2 gap-x-3 content-start p-4 sticky top-0 self-start">
                <p className="font-bold text-muted-fg uppercase text-xs col-span-2">
                  Nonprofit
                </p>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink
                    to={user ? href("/register") : href("/register/welcome")}
                    className={styler}
                  >
                    <BadgeCheck
                      size={19}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Become a Member!</span>
                  </NavLink>
                </Menu.Item>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/donation-forms")} className={styler}>
                    <PanelsTopLeftIcon
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>All-In One Donation Form</span>
                  </NavLink>
                </Menu.Item>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/fund-management")} className={styler}>
                    <SproutIcon
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Savings And Investments</span>
                  </NavLink>
                </Menu.Item>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/fiscal-sponsorship")} className={styler}>
                    <GlobeIcon
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Fiscal Sponsorship</span>
                  </NavLink>
                </Menu.Item>

                <div className="w-full h-[1px] bg-muted mt-6 mb-1 col-span-full" />
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink end to={href("/marketplace")} className={styler}>
                    <LayoutGrid
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Marketplace</span>
                  </NavLink>
                </Menu.Item>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/fundraisers")} className={styler} end>
                    <UsersIcon
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Fundraisers</span>
                  </NavLink>
                </Menu.Item>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/referral-program")} className={styler}>
                    <MegaphoneIcon
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Referral Program</span>
                  </NavLink>
                </Menu.Item>

                <div className="w-full mt-4 col-span-full" />
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/blog")} className={styler}>
                    <LibraryIcon
                      size={18}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                    />
                    <span>Blog</span>
                  </NavLink>
                </Menu.Item>
                <Menu.Item className="col-span-2 grid grid-cols-subgrid">
                  <NavLink to={href("/about-us")} className={styler}>
                    <img
                      src={bg_logo}
                      width={15}
                      height={15}
                      className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      alt=""
                    />
                    <span>Our Mission</span>
                  </NavLink>
                </Menu.Item>
              </Menu.Group>
              {auth_links}
            </div>
            {user ? <UserMenu user={user} /> : null}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
