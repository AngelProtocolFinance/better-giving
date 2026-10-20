import { Outlet } from "react-router";
import type { Route } from "./+types/route";

export const meta: Route.MetaFunction = () => [
  { title: "Sign Up - Better Giving" },
  { name: "robots", content: "noindex" },
];

export default function Layout() {
  return (
    <div className="grid place-items-center px-4 py-14 text-gray-11">
      <Outlet />
    </div>
  );
}
