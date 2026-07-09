import { href } from "react-router";
import { auth_mdlwr, user_ctx } from "#/.server/auth";
import { Footer } from "#/components/footer";
import { AppHeader } from "#/components/header";
import { metas } from "#/helpers/seo";
import { Layout as DashboardLayout } from "#/layout/dashboard";
import type { Route } from "./+types/route";
import { AccountHub } from "./account-hub";
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
      <AppHeader classes="sticky z-40 -top-px" />
      <DashboardLayout
        rootRoute={`${href("/dashboard")}/`}
        linkGroups={linkGroups}
        sidebarHeader={<AccountHub />}
      />
      <Footer variant="minimal" classes="mt-8" />
    </div>
  );
}
