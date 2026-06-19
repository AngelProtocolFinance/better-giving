import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
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
    <Menu.Root positioning={{ placement: "bottom-end", gutter: 15 }}>
      <Menu.Trigger
        data-testid="nav_dropdown"
        className={`group flex items-center gap-x-2 focus-visible:outline-none ${classes}`}
        aria-label="Navigation Menu"
      >
        {user && (
          <UserAvatar
            avatar={user.avatar_url}
            classes="peer group-data-[state=open]:invisible"
          />
        )}
        <div className="peer-hover:text-primary hover:text-primary group-data-[state=open]:rotate-90 transition-transform ease-in-out">
          <MenuIcon
            size={24}
            className="group-data-[state=open]:hidden"
            aria-hidden="true"
          />
          <XIcon
            size={24}
            className="hidden group-data-[state=open]:block"
            aria-hidden="true"
          />
        </div>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner className="z-40">
          <Menu.Content
            asChild
            className="relative grid grid-cols-[auto_1fr] isolate z-40 rounded bg-popover drop-shadow-2xl origin-top data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out"
          >
            <nav>
              <div className="self-start">
                <Menu.ItemGroup className="grid grid-cols-[auto_1fr] gap-y-2 gap-x-3 content-start p-4 sticky top-0 self-start">
                  <p className="font-bold text-muted-fg uppercase text-xs col-span-2">
                    Nonprofit
                  </p>
                  <Menu.Item
                    value="register"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
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
                  <Menu.Item
                    value="donation-forms"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink to={href("/donation-forms")} className={styler}>
                      <PanelsTopLeftIcon
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>All-In One Donation Form</span>
                    </NavLink>
                  </Menu.Item>
                  <Menu.Item
                    value="fund-management"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink to={href("/fund-management")} className={styler}>
                      <SproutIcon
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>Savings And Investments</span>
                    </NavLink>
                  </Menu.Item>
                  <Menu.Item
                    value="fiscal-sponsorship"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink
                      to={href("/fiscal-sponsorship")}
                      className={styler}
                    >
                      <GlobeIcon
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>Fiscal Sponsorship</span>
                    </NavLink>
                  </Menu.Item>

                  <div className="w-full h-px bg-muted mt-6 mb-1 col-span-full" />
                  <Menu.Item
                    value="marketplace"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink end to={href("/marketplace")} className={styler}>
                      <LayoutGrid
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>Marketplace</span>
                    </NavLink>
                  </Menu.Item>
                  <Menu.Item
                    value="fundraisers"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink to={href("/fundraisers")} className={styler} end>
                      <UsersIcon
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>Fundraisers</span>
                    </NavLink>
                  </Menu.Item>
                  <Menu.Item
                    value="referral-program"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink to={href("/referral-program")} className={styler}>
                      <MegaphoneIcon
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>Referral Program</span>
                    </NavLink>
                  </Menu.Item>

                  <div className="w-full mt-4 col-span-full" />
                  <Menu.Item
                    value="blog"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
                    <NavLink to={href("/blog")} className={styler}>
                      <LibraryIcon
                        size={18}
                        className="shrink-0 group-hover:-rotate-12 transition-transform group-hover:stroke-primary"
                      />
                      <span>Blog</span>
                    </NavLink>
                  </Menu.Item>
                  <Menu.Item
                    value="about-us"
                    className="col-span-2 grid grid-cols-subgrid"
                  >
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
                </Menu.ItemGroup>
                {auth_links}
              </div>
              {user ? <UserMenu user={user} /> : null}
            </nav>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
