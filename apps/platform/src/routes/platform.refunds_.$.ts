import { redirect } from "react-router";
import type { Route } from "./+types/platform.refunds_.$";
import { routes } from "./platform/routes";

// everything under the old path — `/platform/refunds/<id>/refund` is the one
// that exists — keeps its tail, so an old modal link lands on the same modal.
// opted out of nesting (`refunds_`) so the bare-path redirect above stays a
// leaf rather than becoming this route's layout.
export const loader = ({ params }: Route.LoaderArgs) =>
  redirect(`/platform/${routes.donations}/${params["*"]}`);
