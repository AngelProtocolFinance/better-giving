import { type ActionFunction, redirect } from "react-router";
import { safeParse } from "valibot";
import { get_session, to_auth } from "#/.server/auth";
import { steps } from "#/pages/registration/routes";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import type { IReg } from "@/reg";
import { Progress } from "@/reg/progress";
import { reg_id, reg_update as reg_update_schema } from "@/reg/schema";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { reg_get, reg_update } from "$/pg/queries/registration";

const changed = <T extends boolean | string | number | undefined>(a: T, b: T) =>
  a != null && b != null && a !== b;

/** `next` is a function where the step it hands off to depends on the
 * application itself — org details branches on `o_type` (see `after_org`). */
export const update_action =
  (next: string | ((reg: IReg) => string)): ActionFunction =>
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

    /* org type + identity are not a step's to write. The org step stopped
     * asking a US applicant for a country, so the reset that used to hang off
     * that field is gone with it; correcting an identity is the change-identity
     * screen's job, resets included (see `change-identity.ts`). */

    const updated = await reg_update(db, rid, attrs);
    if (updated) await enqueue(msg("reg-updated", updated));

    if (prog.step === 5) return redirect(`../${steps.summary}`);
    return redirect(`../${typeof next === "string" ? next : next(reg)}`);
  };
