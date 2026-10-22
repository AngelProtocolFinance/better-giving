import { href } from "react-router";
import { moved } from "#/helpers/moved";
import { endowUpdate } from "#/pages/admin/endow-update-action";
import type { Route } from "./+types/route";

/** Edit Profile folded into Organization; old links and bookmarks land on
 * its Better Giving Page section */
export const loader = ({ params }: Route.LoaderArgs) =>
  moved(`${href("/admin/:id/organization", { id: params.id })}#page`);

/** a save from a page loaded before the fold */
export const action = endowUpdate({ success: "Profile updated" });
