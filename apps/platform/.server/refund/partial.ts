import { eq, sql } from "drizzle-orm";
import { humanize } from "@/helpers/decimal";
import { db } from "../pg/db";
import { dispute_loss_recorded } from "../pg/queries/dispute";
import {
  type IOwed,
  type OwedParty,
  owed_for_party,
  owed_total,
  record_owed,
} from "../pg/queries/owed";
import { refunds_credited_back } from "../pg/queries/owed-refund";
import { donations } from "../pg/schema/donation";
import type { OwedSource } from "./apply";
import {
  grant_went_out,
  type LockedDist,
  owed_shares,
  scaled,
  settled_dists_locked,
} from "./share";

export interface ShareTaken extends OwedSource {
  donation_id: string;
  /** the share of the charge taken back so far, short of the whole */
  f: number;
  /** what the charge took, in the unit of `refunds` */
  of: number;
  /** the provider refunds `f` counts, by id: one whose failure was already
   * credited back is taken out of it */
  refunds?: { id: string; amount: number }[];
  /** what the provider charged for the dispute, in usd; 0 when none */
  fee_dispute_usd: number;
  /** the gift's lost disputes `f` counts: once recorded, the gift's
   * refunded share holds them */
  lost?: string[];
}

export interface ShareRecorded {
  /** the share recorded: `f`, less any failed refund it counted */
  f: number;
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
      return { undistributed: true, f: s.f, owed_msgs: [], pending: [] };
    }
    // read under the dists' locks, which `refund_failed` takes first: a
    // failure committed since the provider's list was read is seen here
    const counted = s.refunds ?? [];
    const failed = await refunds_credited_back(
      tx,
      s.donation_id,
      counted.map((r) => r.id)
    );
    const failed_amount = counted
      .filter((r) => failed.has(r.id))
      .reduce((sum, r) => sum + r.amount, 0);
    const f = s.f - failed_amount / s.of;
    if (f <= 1e-9)
      return { undistributed: false, f: 0, owed_msgs: [], pending: [] };
    await tx
      .update(donations)
      .set({
        refunded_share: sql`GREATEST(COALESCE(${donations.refunded_share}, 0), ${f})`,
      })
      .where(eq(donations.id, s.donation_id));
    // a chargeback lost under a dispute on record, or a lost dispute this
    // refund counts: refunded_share now holds it, so a later open or refund
    // doesn't count that dispute again
    const lost_disputes = [
      ...(s.source === "dispute" ? [s.source_ref] : []),
      ...(s.lost ?? []),
    ];
    for (const id of lost_disputes) {
      await dispute_loss_recorded(tx, { id, donation_id: s.donation_id, now });
    }

    const names = new Map(ds.map((d) => [d.to_id, d.to_name]));
    const owed_msgs: string[] = [];
    const shares = owed_shares(ds, {
      f,
      fee_usd: s.fee_dispute_usd,
      owes: grant_went_out,
    });
    const owed_line = (row: IOwed, party: OwedParty) => {
      const usd = humanize(owed_total(row));
      return "npo_id" in party
        ? `$${usd} recorded as owed by ${names.get(party.npo_id) || "its npo"} (npo ${party.npo_id}), to recover from its future grants`
        : `$${usd} of its commission recorded as owed by referrer ${"referrer_user" in party ? party.referrer_user : party.referrer_npo}, to recover from its next commission`;
    };
    for (const share of shares) {
      const row = await record_owed(tx, {
        ...share,
        donation_id: s.donation_id,
        source: s.source,
        source_ref: s.source_ref,
        now,
      });
      owed_msgs.push(owed_line(row, share.party));
    }

    // a dispute's open owes a grant not yet out too: a dist whose npo's row
    // already counts this share as received is owed, not ops' to settle
    const pending: string[] = [];
    const not_out = new Map<number, LockedDist[]>();
    for (const d of ds.filter((d) => !grant_went_out(d))) {
      not_out.set(d.to_id, [...(not_out.get(d.to_id) ?? []), d]);
    }
    for (const [npo_id, nds] of not_out) {
      const party = { npo_id };
      const row = await owed_for_party(s.donation_id, party, tx);
      const share = nds.reduce((sum, d) => sum + scaled(d.net, f), 0);
      if (row && row.received_usd - row.credited_back_usd >= share - 0.005) {
        owed_msgs.push(owed_line(row, party));
        continue;
      }
      for (const d of nds) {
        pending.push(
          `dist ${d.id} to ${d.to_name || "its npo"} (npo ${d.to_id}): ${d.payout_type === "pending" ? "its grant payout is still pending" : "its share is still in the npo's balances"}, so nothing of it is recorded as owed`
        );
      }
    }
    return { undistributed: false, f, owed_msgs, pending };
  });
}
