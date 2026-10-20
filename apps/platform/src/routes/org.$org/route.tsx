import { Outlet, redirect } from "react-router";
import type { Route } from "./+types/route";

/** layout of /org/:org/:campaign. redirect only the bare org path. */
export const loader = ({ request, params }: Route.LoaderArgs) => {
  const path = decodeURIComponent(new URL(request.url).pathname).replace(
    /\/$/,
    ""
  );
  if (path === `/org/${params.org}`) {
    throw redirect(`/marketplace/${params.org}`, 302);
  }
  return null;
};

export default function OrgLayout() {
  return <Outlet />;
}
