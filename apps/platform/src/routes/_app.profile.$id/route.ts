import { href, redirect } from "react-router";
import type { Route } from "./+types/route";

export const loader = ({ params, request }: Route.LoaderArgs) =>
  redirect(
    `${href("/org/:org", { org: params.id })}${new URL(request.url).search}`
  );
