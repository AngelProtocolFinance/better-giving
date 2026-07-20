import { redirect } from "react-router";
import type { Route } from "./+types/forms.$id._index";

// GET /forms/:id -> /forms/:id/custom-dimensions, passing through any query
// params. this is the index of the forms/:id layout, so bare /forms/:id lands
// here. (was forms/[id]/route.ts under next.)
export function loader({ params, request }: Route.LoaderArgs) {
  const search = new URL(request.url).search;
  return redirect(`/forms/${params.id}/custom-dimensions${search}`);
}
