import {
  admin_ctx,
  auth_mdlwr,
  npo_admin_mdlwr,
  user_ctx,
} from "#/.server/auth";
import { Footer } from "#/components/footer";
import { metas } from "#/helpers/seo";
import { Layout } from "#/layout/dashboard";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";
import { linkGroups } from "./constants";
import { Header } from "./header";
import { Loader as SidebarHeader } from "./sidebar-header";
import type { LoaderData } from "./types";

export { ErrorBoundary } from "#/components/error";

export const meta: Route.MetaFunction = ({ loaderData: d }) => {
  return metas({
    title: d ? `Dashboard - ${d.endow.name} ` : "Dashboard",
  });
};

export const middleware = [auth_mdlwr, npo_admin_mdlwr];

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const id = context.get(admin_ctx);

  const npo = await npo_get(id);
  if (!npo) return new Response("Not found", { status: 404 });

  return {
    user,
    id,
    endow: {
      logo: npo.logo,
      name: npo.name,
      allocation: npo.allocation,
      payout_minimum: npo.payout_minimum,
    },
  } satisfies LoaderData;
};

export default function AdminLayout({
  loaderData: data,
}: Route.ComponentProps) {
  return (
    <div className="grid">
      <Header classes="sticky z-40 top-[-1px]" />
      <Layout
        rootRoute="/admin/:id/"
        linkGroups={linkGroups}
        sidebarHeader={<SidebarHeader {...data.endow} />}
      />
      <Footer />
    </div>
  );
}
