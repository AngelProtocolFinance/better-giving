import { addYears } from "date-fns";
import { eq } from "drizzle-orm";
import { referral_id } from "#/helpers/referral";
import type { IBapp } from "@/banking";
import { resp } from "@/helpers/https";
import { msg } from "@/queue";
import type { Progress, TStatus } from "@/reg";
import { enqueue, in_dedupe_window } from "$/kit/queue";
import { wise } from "$/kit/wise";
import { db } from "$/pg/db";
import { bapp_put } from "$/pg/queries/banking";
import { reg_update, reg_update_from } from "$/pg/queries/registration";
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
  | "referrer_user"
  | "referrer_npo"
  | "referrer_expiry"
  | "referral_id"
>;

/** what `reg-updated` carries, plus the npo the approval minted: met by the
 * route's `IReg` and by a drizzle row alike */
interface IApprovedRow {
  id: string;
  status: TStatus | null;
  updated_at: string | null;
  status_approved_npo_id?: number | null;
}

/** enqueues what an approval announces, for a row an approval settled: this
 * call's, or an earlier one's. inside qstash's dedupe window the repeat
 * carries the same keys (npo id; id+status+updated_at), so it reaches the
 * queue only if the first enqueue never did. past the window it enqueues
 * nothing, since the same keys would mail again. anything but an approved row
 * is a conflicting state. */
export async function announce_approval(row: IApprovedRow | null) {
  const npo_id = row?.status === "03" ? row.status_approved_npo_id : null;
  if (!row || npo_id == null)
    throw resp.status(409, "registration not in review");
  if (in_dedupe_window(row.updated_at)) {
    await enqueue(msg("banking-new", { npo_id }), msg("reg-updated", row));
  }
  return npo_id;
}

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

  ///////////// approval of new endowment /////////////
  // id is a PG IDENTITY column
  const wacc = await wise.v2_account(+r.o_bank_id);

  const new_endow: NpoInsert = {
    ...ecfr,
    social_media_urls: {},
    sdgs: [],
    overview_pt: "[]",
    published: false,
    hide_bg_tip: false,
    donor_address_required: false,
    fund_opt_in: true,
  };

  const approved = await db.transaction(async (tx) => {
    // the claim goes first: a second approval that read "02" before this one
    // committed waits on the row lock, then finds "03" and stops before its npo
    // insert, which would otherwise surface as a unique-key 500. the row it
    // finds is announced as this one's.
    const claimed = await reg_update_from(tx, r.id, ["02"], { status: "03" });
    if (!claimed.won) return claimed.row;

    const [inserted] = await tx.insert(npos).values(new_endow).returning();
    const id = Number(inserted.id);

    const now = new Date().toISOString();
    const bank_new: IBapp = {
      id: r.o_bank_id,
      npo_id: id,
      bank_statement_url: r.o_bank_statement,
      bank_summary: wacc.longAccountSummary,
      rejection_reason: "",
      status: "default",
      date_created: now,
      updated_at: now,
    };

    // a fresh npo can't own it yet: another npo does, so approve nothing
    if (!(await bapp_put(tx, bank_new))) {
      throw new Error(`bank ${r.o_bank_id} is already registered`);
    }
    await userxnpo_put(tx, id, registrant_id);
    return reg_update(tx, r.id, { status_approved_npo_id: id });
  });

  return announce_approval(approved);
};
