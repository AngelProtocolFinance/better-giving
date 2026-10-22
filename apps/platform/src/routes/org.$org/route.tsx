import { Outlet } from "react-router";

/** /org/:org is the profile (`org.$org._index`); campaigns and programs
 * sit under it, each in its own layout */
export default function OrgLayout() {
  return <Outlet />;
}
