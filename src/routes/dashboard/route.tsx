import { href } from "react-router";
import { auth_mdlwr, user_ctx } from "#/.server/auth";
import { Footer } from "#/components/footer";
import { metas } from "#/helpers/seo";
import { Layout as DashboardLayout } from "#/layout/dashboard";
import type { Route } from "./+types/route";
import { Header } from "./header";
import { linkGroups } from "./routes";

export { ErrorBoundary } from "#/components/error";

export const meta: Route.MetaFunction = () => metas({ title: "My Donations" });

export const middleware = [auth_mdlwr];

export const loader = async ({ context }: Route.LoaderArgs) => {
  return { user: context.get(user_ctx) };
};

export default function Layout() {
  return (
    <div className="grid">
      <Header classes="sticky z-40 top-[-1px]" />
      <DashboardLayout
        rootRoute={`${href("/dashboard")}/`}
        linkGroups={linkGroups}
        //dummy header
        sidebarHeader={<div className="h-5" />}
      />
      <Footer classes="mt-8" />
    </div>
  );
}
