import { addYears } from "date-fns";
import { eq } from "drizzle-orm";
import { referral_id } from "#/helpers/referral";
import type { IBapp } from "@/banking";
import * as banking_new from "@/queue/msgs/banking-new";
import * as reg_updated from "@/queue/msgs/reg-updated";
import type { Progress } from "@/reg";
import { enqueue } from "$/kit/queue";
import { wise } from "$/kit/wise";
import { db } from "$/pg/db";
import { bapp_put } from "$/pg/queries/banking";
import { npo_update } from "$/pg/queries/npo";
import { reg_update } from "$/pg/queries/registration";
import { userxnpo_put } from "$/pg/queries/user";
import { user } from "$/pg/schema/auth";
import { npos } from "$/pg/schema/npo";

type NpoInsert = typeof npos.$inferInsert;

export type EndowContentFromReg = Pick<
  NpoInsert,
  | "active_in_countries"
  | "endow_designation"
  | "fiscal_sponsored"
  | "hq_country"
  | "kyc_donors_only"
  | "name"
  | "registration_number"
  | "url"
  | "claimed"
  | "referrer_user"
  | "referrer_npo"
  | "referrer_expiry"
  | "referral_id"
>;

export const npo_new = async (r: NonNullable<Progress["banking"]>) => {
  const rid = referral_id("NPO");
  const ecfr: EndowContentFromReg = {
    active_in_countries: r.o_activity_countries ?? [],
    endow_designation: r.o_designation,
    fiscal_sponsored: r.o_type === "other",
    hq_country: r.o_hq_country,
    kyc_donors_only: true,
    name: r.o_name,
    registration_number:
      r.o_type === "501c3" ? r.o_ein : r.o_registration_number,
    url: r.o_website,
    claimed: true,
    referral_id: rid,
  };

  if (r.rm === "referral" && r.rm_referral_code) {
    const onboarded = new Date();
    const expiry = addYears(onboarded, 3).toISOString();
    if (r.rm_referral_code.startsWith("NPO-")) {
      ecfr.referrer_npo = r.rm_referral_code;
    } else {
      ecfr.referrer_user = r.rm_referral_code;
    }
    ecfr.referrer_expiry = expiry;
  }

  // r.r_id is the registrant email; look up their user.id for the FK
  const [registrant] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, r.r_id))
    .limit(1);
  if (!registrant) throw new Error(`user not found for email ${r.r_id}`);
  const registrant_id = registrant.id;

  ///////////// APPROVAL OF CLAIM /////////////
  if (r.claim) {
    const { id } = r.claim;
    const wacc = await wise.v2_account(+r.o_bank_id);
    const bank_new: IBapp = {
      id: r.o_bank_id,
      npo_id: id,
      bank_statement_url: r.o_bank_statement,
      bank_summary: wacc.longAccountSummary,
      rejection_reason: "",
      status: "default",
      date_created: new Date().toISOString(),
    };

    await db.transaction(async (tx) => {
      await bapp_put(tx, bank_new);
      await userxnpo_put(tx, id, registrant_id);
      await reg_update(tx, r.id, {
        status: "03",
        status_approved_npo_id: id,
      });
      await npo_update(tx, id, ecfr);
    });
    await enqueue(banking_new.to_msg({ npo_id: id }), reg_updated.to_msg(r));
    return id;
  }

  ///////////// APPROVAL OF NEW ENDOWMENT /////////////
  // npo_count_inc eliminated — PG IDENTITY auto-generates id
  const wacc = await wise.v2_account(+r.o_bank_id);

  const new_endow: NpoInsert = {
    ...ecfr,
    social_media_urls: {},
    sdgs: [],
    published: false,
    hide_bg_tip: false,
    donor_address_required: false,
    fund_opt_in: true,
  };

  const npo_id = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(npos).values(new_endow).returning();
    const id = Number(inserted.id);

    const bank_new: IBapp = {
      id: r.o_bank_id,
      npo_id: id,
      bank_statement_url: r.o_bank_statement,
      bank_summary: wacc.longAccountSummary,
      rejection_reason: "",
      status: "default",
      date_created: new Date().toISOString(),
    };

    await bapp_put(tx, bank_new);
    await userxnpo_put(tx, id, registrant_id);
    await reg_update(tx, r.id, {
      status: "03",
      status_approved_npo_id: id,
    });
    return id;
  });

  await enqueue(banking_new.to_msg({ npo_id: npo_id }), reg_updated.to_msg(r));
  return npo_id;
};
