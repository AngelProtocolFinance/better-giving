import { href } from "react-router";
import { moved } from "#/helpers/moved";
import { endowUpdate } from "#/pages/admin/endow-update-action";
import type { Route } from "./+types/route";

/** old Edit Profile links and bookmarks land on Organization's Better Giving
 * Page section, which holds those fields now */
export const loader = ({ params }: Route.LoaderArgs) =>
  moved(`${href("/admin/:id/organization", { id: params.id })}#page`);

/** a save from an Edit Profile page loaded before this route redirected */
export const action = endowUpdate({ success: "Profile updated" });
