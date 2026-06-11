import { Outlet } from "react-router";
import { base_url } from "#/constants/env";
import { metas } from "#/helpers/seo";

export { loader } from "./api";

import type { Route } from "./+types/route";

export const meta: Route.MetaFunction = ({ location: l }) =>
  metas({
    title: "Registration Portal",
    url: `${base_url}/${l.pathname}`,
  });

export default function Layout({ loaderData: user }: Route.ComponentProps) {
  return (
    <div className="grid content-start justify-items-center py-8">
      <Outlet context={user} />
    </div>
  );
}
