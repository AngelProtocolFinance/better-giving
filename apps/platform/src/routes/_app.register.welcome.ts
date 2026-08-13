import {
  type ActionFunction,
  type LoaderFunction,
  redirect,
} from "react-router";

/** `/register` is the welcome screen. skew protection has no `.data` pinning,
 * so old documents still linking or POSTing here must land somewhere real
 * rather than 404/405. */
const to_register = (request: Request) =>
  redirect(`/register${new URL(request.url).search}`);

export const loader: LoaderFunction = ({ request }) => to_register(request);
export const action: ActionFunction = ({ request }) => to_register(request);
