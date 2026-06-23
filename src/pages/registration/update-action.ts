import { type ActionFunction, redirect } from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import { Progress } from "@/reg/progress";
import { reg_id, reg_update as reg_update_schema } from "@/reg/schema";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";

const changed = <T extends boolean | string | number | undefined>(a: T, b: T) =>
  a != null && b != null && a !== b;

export const update_action =
  (next: string): ActionFunction =>
  async ({ request, params }) => {
    const { user } = await get_session(request);
    if (!user) return to_auth(request);

    const p1 = safeParse(reg_id, params.reg_id);
    if (p1.issues) return resp.status(400, p1.issues[0].message);
    const rid = p1.output;
    const p2 = safeParse(reg_update_schema, await request.json());
    if (p2.issues) return resp.status(400, p2.issues[0].message);
    const upd8 = p2.output;

    const reg = await reg_get(rid);
    if (!reg) throw resp.status(404, `reg:${rid} not found`);

    // approved
    if (reg.status === "03") {
      throw resp.status(400, `reg:${rid} already approved`);
    }

    if (reg.r_id !== user.email && user.role !== "admin") {
      throw resp.status(401);
    }

    const { update_type, ...fields } = upd8;
    const attrs: Record<string, unknown> = { ...fields, status: "01" as const };

    //resets
    const prog = new Progress(reg);
    const done_fsa_url = prog.fsa_url;

    const contact_changed =
      update_type === "contact" &&
      (changed(reg.r_first_name, upd8.r_first_name) ||
        changed(reg.r_last_name, upd8.r_last_name) ||
        changed(reg.o_name, upd8.o_name) ||
        changed(reg.r_org_role, upd8.r_org_role));

    // a change in fsa country -> US doesn't mean NPO is 501c3
    if (done_fsa_url && contact_changed) {
      attrs.o_fsa_signing_url = null;
      attrs.o_fsa_signed_doc_url = null;
    }

    const country_changed_from_US =
      update_type === "org" &&
      changed(reg.o_hq_country, upd8.o_hq_country) &&
      upd8.o_hq_country !== "United States";

    const done_o_type = prog.org_type;
    const done_ein = prog.docs_ein;
    const done = done_o_type || done_ein;
    if (done && done.o_type === "501c3" && country_changed_from_US) {
      attrs.o_type = null;
      attrs.o_ein = null;
    }

    const updated = await reg_update(db, rid, attrs);
    if (updated) await enqueue(msg("reg-updated", updated));

    if (prog.step === 6) return redirect(`../${6}`);
    return redirect(`../${next}`);
  };
