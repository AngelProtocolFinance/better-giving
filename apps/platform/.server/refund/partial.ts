import { eq, sql } from "drizzle-orm";
import { humanize } from "@/helpers/decimal";
import { db } from "../pg/db";
import { owed_total, record_owed } from "../pg/queries/owed";
import { donations } from "../pg/schema/donation";
import type { OwedSource } from "./apply";
import { grant_went_out, owed_shares, settled_dists_locked } from "./share";

export interface ShareTaken extends OwedSource {
  donation_id: string;
  /** the share of the charge taken back so far, short of the whole */
  f: number;
  /** what the provider charged for the dispute, in usd; 0 when none */
  fee_dispute_usd: number;
}

export interface ShareRecorded {
  /** no dist left to take a share of: none distributed yet, or every one
   * reversed since the gift was read */
  undistributed: boolean;
  /** what each party now owes back, one line per row */
  owed_msgs: string[];
  /** one line per dist whose grant hasn't gone out, so nothing of it is owed */
  pending: string[];
}

/**
 * records on a gift whose charge was partly taken back what each party owes
 * of it: `f` of what an npo whose grant went out received plus its card
 * fee, the dispute fee in full, and `f` of each paid commission. a party's
 * row only grows, so a later share, or the whole, grows the same row.
 * reverses nothing
 */
export async function record_share(s: ShareTaken): Promise<ShareRecorded> {
  const now = new Date().toISOString();
  return db.transaction(async (tx) => {
    const ds = await settled_dists_locked(tx, s.donation_id);
    if (ds.length === 0) {
      return { undistributed: true, owed_msgs: [], pending: [] };
    }
    await tx
      .update(donations)
      .set({
        refunded_share: sql`GREATEST(COALESCE(${donations.refunded_share}, 0), ${s.f})`,
      })
      .where(eq(donations.id, s.donation_id));

    const names = new Map(ds.map((d) => [d.to_id, d.to_name]));
    const owed_msgs: string[] = [];
    const shares = owed_shares(ds, {
      f: s.f,
      fee_usd: s.fee_dispute_usd,
      owes: grant_went_out,
    });
    for (const share of shares) {
      const row = await record_owed(tx, {
        ...share,
        donation_id: s.donation_id,
        source: s.source,
        source_ref: s.source_ref,
        now,
      });
      const usd = humanize(owed_total(row));
      owed_msgs.push(
        "npo_id" in share.party
          ? `$${usd} recorded as owed by ${names.get(share.party.npo_id) || "its npo"} (npo ${share.party.npo_id}), to recover from its future grants`
          : `$${usd} of its commission recorded as owed by referrer ${"referrer_user" in share.party ? share.party.referrer_user : share.party.referrer_npo}, to recover from its next commission`
      );
    }
    const pending = ds
      .filter((d) => !grant_went_out(d))
      .map(
        (d) =>
          `dist ${d.id} to ${d.to_name || "its npo"} (npo ${d.to_id}): ${d.payout_type === "pending" ? "its grant payout is still pending" : "its share is still in the npo's balances"}, so nothing of it is recorded as owed`
      );
    return { undistributed: false, owed_msgs, pending };
  });
}
