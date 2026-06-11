import { type ActionFunction, href, redirect } from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { gen_fsa_signing_url } from "#/.server/registration/gen-fsa-signing-url";
import { reg_id_from_signer_eid } from "#/.server/registration/helpers";
import { resp } from "@/helpers/https";
import * as reg_updated from "@/queue/msgs/reg-updated";
import type { IFsaSigner } from "@/reg";
import { Progress } from "@/reg/progress";
import { fsa_docs_or_signer, type IFsaDocs, reg_id } from "@/reg/schema";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";

export const action: ActionFunction = async ({ request, params }) => {
  const { user } = await get_session(request);
  if (!user) return to_auth(request);

  const content_type = request.headers.get("content-type");
  const payload =
    content_type === "application/json"
      ? // documentation form
        await request.json()
      : // sign-result page
        await request.formData().then((fv) => fv.get("signer_eid")?.toString());

  const p1 = safeParse(fsa_docs_or_signer, payload);
  if (p1.issues) return resp.status(400, p1.issues[0].message);
  const docs_or_eid = p1.output;

  // re-generate from existing signer
  if (typeof docs_or_eid === "string") {
    const rid = await reg_id_from_signer_eid(docs_or_eid);
    const reg = await reg_get(rid);
    if (!reg) throw `registration not found: ${rid}`;
    const r = new Progress(reg).docs_fsa;
    if (!r) throw `registration: ${rid} doesn't contain fsa docs`;

    const from = new URL(request.url);
    from.pathname = href("/register/:reg_id/sign-result", { reg_id: rid });
    from.search = "";

    const docs: IFsaDocs = {
      o_registration_number: r.o_registration_number,
      o_legal_entity_type: r.o_legal_entity_type,
      o_project_description: r.o_project_description,
      o_proof_of_reg: r.o_website,
      r_proof_of_identity: r.r_proof_of_identity,
    };

    const signer: IFsaSigner = {
      first_name: r.r_first_name,
      last_name: r.r_last_name,
      email: reg.r_id,
      role:
        r.r_org_role === "other" ? (r.r_org_role_other ?? "") : r.r_org_role,
      org_name: r.o_name,
      org_hq_country: r.o_hq_country,
      docs,
    };
    const url = await gen_fsa_signing_url(rid, signer, from.toString());

    const u1 = await reg_update(db, rid, {
      status: "01",
      o_fsa_signing_url: url,
    });
    if (u1) await enqueue(reg_updated.to_msg(u1));

    return redirect(url);
  }

  const p2 = safeParse(reg_id, params.reg_id);
  if (p2.issues) return resp.status(400, p2.issues[0].message);
  const rid = p2.output;
  const reg = await reg_get(rid);
  if (!reg) throw `registration not found: ${rid}`;
  const r = new Progress(reg).org_type;
  if (!r) throw `registration not ready for FSA signing: ${rid}`;

  const from = new URL(request.url);
  from.pathname = href("/register/:reg_id/sign-result", { reg_id: rid });
  from.search = "";

  const signer: IFsaSigner = {
    first_name: r.r_first_name,
    last_name: r.r_last_name,
    email: reg.r_id,
    role: r.r_org_role === "other" ? (r.r_org_role_other ?? "") : r.r_org_role,
    org_hq_country: r.o_hq_country,
    org_name: r.o_name,
    docs: docs_or_eid,
  };

  const url = await gen_fsa_signing_url(rid, signer, from.toString());

  const u2 = await reg_update(db, rid, {
    ...docs_or_eid,
    status: "01",
    o_fsa_signing_url: url,
  });
  if (u2) await enqueue(reg_updated.to_msg(u2));

  return redirect(url);
};
