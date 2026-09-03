import type { LoaderFunction } from "react-router";
import { get_session } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { anvil } from "$/kit/anvil";
import { is_fsa_doc_eid } from "$/pg/queries/registration";
import { user_by_w_form } from "$/pg/queries/user";

export const loader: LoaderFunction = async ({ request, params: { eid } }) => {
  if (!eid) return new Response("missing doc eid", { status: 404 });

  // two document kinds come through one route and the eid alone doesn't say
  // which. anvil exposes no query that resolves a document-group eid — there
  // is no `documentGroup(eid:)` root field, only `etchPacket` and `weldData`
  // keyed by their own eids — so the kind can only be recognised from what we
  // stored ourselves, and the direction of that recognition is what decides
  // who a stranger's eid is served to.
  //
  // so the agreement is the half identified positively. it is the half that
  // has to stay open: its download link is emailed to a registrant who very
  // likely has no session and may be on another device. everything else —
  // a w-9, or an eid we hold no record of at all — needs its owner, because a
  // signed w-9 carries the signer's tin, legal name and address and `w_form`
  // holds one eid per user: sign a second form and the first is orphaned,
  // recorded nowhere, and indistinguishable from an eid we never issued.
  // identifying the *w-9* positively would hand every one of those to anyone
  // holding the eid, forever.
  //
  // recognition has to beat the redirect. anvil sends the signer to the
  // success page in parallel with its etch-complete webhook, so a record
  // written by that webhook is not there yet when the page's download link is
  // clicked. `registrations.o_fsa_doc_eid` is stamped when the packet is
  // CREATED, which is strictly before both.
  //
  // the ownership tier below asks only "does a USER row claim this eid".
  // `npos.w_form` is a second tax-form column, inert today — nothing reads or
  // writes it and no link here is built from it. the day an npo w-9 becomes
  // downloadable through this route, an eid held there is unclaimed by any
  // user, falls past this branch, and is served to anyone holding it. no test
  // fails. whoever wires that up adds a second lookup in this same tier.
  if (!(await is_fsa_doc_eid(eid))) {
    const owner = await user_by_w_form(eid);
    const { user } = await get_session(request);
    // email, not id: it is the only key both sides expose (`IUserDb` has no
    // `id`), and better-auth's `user.email` is notNull + unique, so it pins
    // exactly one row the way the primary key would. both values are read
    // back off that same row, so this is never a normalization comparison.
    if (!owner || user?.email !== owner.email) {
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
