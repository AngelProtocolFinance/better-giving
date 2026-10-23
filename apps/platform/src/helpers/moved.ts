import { redirect } from "react-router";

/** a 301 with a bounded lifetime: a browser keeps a bare 301 forever, so a
 * rollback to a deploy that redirects the other way would loop */
export const moved = (url: string) =>
  redirect(url, {
    status: 301,
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
