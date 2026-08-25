import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { Footer } from "#/components/footer";
import { AppHeader } from "#/components/header";
import { Sidebar, SidebarOpener } from "./sidebar";
import type { LinkGroup } from "./sidebar/types";

type DashboardLayoutProps = {
  linkGroups: LinkGroup[];
  sidebarHeader?: ReactNode;
  rootRoute: string;
  /** the donor dashboard drops the header's auth slot; the two admin surfaces
   *  keep it. the only chrome difference between the three shells. */
  headerVariant?: "default" | "bare";
};

/** the whole dashboard page, not just the sidebar: sticky header, the
 *  sidebar/views grid, minimal footer. all three sidebar surfaces (donor, npo
 *  admin, platform admin) render this and differ only in their links, their
 *  sidebar header, and whether the app header carries an auth slot. the route
 *  module keeps its own middleware, loader and meta — those are route-module
 *  contracts and cannot be lifted into a component. */
export function Layout({
  linkGroups,
  sidebarHeader,
  rootRoute,
  headerVariant = "default",
}: DashboardLayoutProps) {
  return (
    <div className="grid">
      <AppHeader variant={headerVariant} classes="sticky z-sticky -top-px" />
      <div className="grid max-md:content-start md:grid-cols-[auto_1fr] border-b">
        <SidebarOpener
          className="md:hidden"
          linkGroups={linkGroups}
          rootRoute={rootRoute}
        />
        <Sidebar
          className="max-md:hidden"
          linkGroups={linkGroups}
          sidebarHeader={sidebarHeader}
        />
        {/** views */}
        <div className="@container min-h-[100dvh]">
          <Outlet />
        </div>
      </div>
      <Footer variant="minimal" />
    </div>
  );
}
