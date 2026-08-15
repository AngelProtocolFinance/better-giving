import {
  type ActionFunction,
  type LoaderFunction,
  redirect,
} from "react-router";

/** the typed-code screen is gone — verification is a link now. skew protection
 * has no `.data` pinning, so old documents still linking or POSTing here must
 * land on the inbox screen rather than 404/405. */
const to_check_email = (request: Request) =>
  redirect(`/check-email${new URL(request.url).search}`);

export const loader: LoaderFunction = ({ request }) => to_check_email(request);
export const action: ActionFunction = ({ request }) => to_check_email(request);
