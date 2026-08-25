import { Outlet } from "react-router";
import { metas } from "#/helpers/seo";
import type { Route } from "./+types/route";

export const meta: Route.MetaFunction = () =>
  metas({ title: "Sign Up - Better Giving" });

export default function Layout() {
  return (
    <div className="grid place-items-center px-4 py-14 text-gray-11">
      <Outlet />
    </div>
  );
}
