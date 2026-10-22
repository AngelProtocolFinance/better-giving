import { href, redirect } from "react-router";
import type { Route } from "./+types/route";

/** Edit Profile folded into Organization; old links and bookmarks land on
 * its Better Giving Page section */
export const loader = ({ params }: Route.LoaderArgs) =>
  redirect(`${href("/admin/:id/organization", { id: params.id })}#page`, 301);
