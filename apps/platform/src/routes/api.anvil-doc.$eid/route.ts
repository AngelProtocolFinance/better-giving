import type { LoaderFunction } from "react-router";
import { get_session } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { anvil } from "$/kit/anvil";
import { user_by_w_form } from "$/pg/queries/user";

export const loader: LoaderFunction = async ({ request, params: { eid } }) => {
  if (!eid) return new Response("missing doc eid", { status: 404 });

  // this route serves two document kinds and the eid alone doesn't say which.
  // a signed w-9 carries the signer's tin, legal name and address, and its eid
  // is only ever stored on the signer's own row — so a hit here means w-9 and
  // owner. a miss means the fund services agreement, whose download link is
  // emailed to a registrant who very likely has no session and may be on
  // another device; that link has to keep working unauthenticated.
  const owner = await user_by_w_form(eid);
  if (owner) {
    const { user } = await get_session(request);
    // email, not id: it is the only key both sides expose (`IUserDb` has no
    // `id`), and better-auth's `user.email` is notNull + unique, so it pins
    // exactly one row the way the primary key would. both values are read
    // back off that same row, so this is never a normalization comparison.
    if (user?.email !== owner.email) {
      // a download, not a page — bounce rather than redirect to login
      return resp.status(403, "not your document");
    }
  }

  const { data, statusCode } = await anvil.downloadDocuments(eid, {
    dataType: "stream",
  });

  return new Response(data, {
    status: statusCode,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="bettergiving-fs-ga.zip"`,
      // the w-9 half carries a taxpayer id and is served only to its signer:
      // never a shared cache, never a browser disk cache. the agreement half
      // isn't sensitive, but one set of headers beats two paths and the
      // agreement gains nothing from being cacheable.
      "cache-control": "private, no-store",
      vary: "cookie",
    },
  });
};
