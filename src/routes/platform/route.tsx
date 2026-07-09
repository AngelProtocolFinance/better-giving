import { href } from "react-router";
import { admin_mdlwr, auth_mdlwr } from "#/.server/auth";
import { Footer } from "#/components/footer";
import { AppHeader } from "#/components/header";
import { metas } from "#/helpers/seo";
import { Layout } from "#/layout/dashboard";
import type { Route } from "./+types/route";
import { link_groups } from "./constants";

export { ErrorBoundary } from "#/components/error";

export const meta: Route.MetaFunction = () =>
  metas({ title: "Platform Admin" });

export const middleware = [auth_mdlwr, admin_mdlwr];

export default function Page() {
  return (
    <div className="grid">
      <AppHeader classes="sticky z-40 -top-px" />
      <Layout
        rootRoute={`${href("/platform")}/`}
        linkGroups={link_groups}
        // dummy header
        sidebarHeader={<div className="h-5" />}
      />
      <Footer variant="minimal" />
    </div>
  );
}
