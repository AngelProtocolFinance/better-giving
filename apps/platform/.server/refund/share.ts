import { and, asc, eq, type SQL, sql } from "drizzle-orm";
import type { DbOrTx } from "../pg/queries/helpers";
import type { IOwedRecord } from "../pg/queries/owed";
import { dists } from "../pg/schema/dist";
import { payouts } from "../pg/schema/payout";
import { referrer_commissions } from "../pg/schema/referrer";
import { dist_settled_usd, fee_processing_usd, referrer_of } from "./plan";

/** how much of a charge has been taken back so far, this event included:
 * every refund and every dispute on it, `taken` and `of` in one unit */
export interface Share {
  taken: number;
  of: number;
}

/** the whole charge, for a caller that only ever takes all of it back */
export const WHOLE: Share = { taken: 1, of: 1 };

/** `taken` over `of`, at most 1; null when either can't size the charge */
export function fraction_of(s: Share): number | null {
  const { taken, of } = s;
  if (!Number.isFinite(taken) || !Number.isFinite(of)) return null;
  if (taken <= 0 || of <= 0) return null;
  return Math.min(taken / of, 1);
}

/** `usd` scaled by `f`, in whole cents rounded down so a share never passes
 * the whole; the whole as it is. the epsilon keeps 0.3 * 90 from flooring to
 * 26.99 */
export const scaled = (usd: number, f: number) =>
  f >= 1 ? usd : Math.floor(usd * f * 100 + 1e-6) / 100;

type PayoutType = (typeof payouts.$inferSelect)["type"];

export type LockedDist = Awaited<ReturnType<typeof dists_locked>>[number];

/** the gift's dists not yet reversed, each with its commission and its
 * payout's type, held locked: a reversal of one waits */
export const settled_dists_locked = (tx: DbOrTx, donation_id: string) =>
  dists_locked(
    tx,
    and(eq(dists.donation_id, donation_id), eq(dists.status, "settled"))
  );

/** `settled_dists_locked`, reversed dists included */
export const gift_dists_locked = (tx: DbOrTx, donation_id: string) =>
  dists_locked(tx, eq(dists.donation_id, donation_id));

async function dists_locked(tx: DbOrTx, where: SQL | undefined) {
  const rows = await tx
    .select({
      id: dists.id,
      status: dists.status,
      refund_status: dists.refund_status,
      to_id: dists.to_id,
      to_name: dists.to_name,
      net: dists.net,
      fee_base: dists.fee_base,
      fee_fsa: dists.fee_fsa,
      fee_processing: dists.fee_processing,
      fee_allowance: dists.fee_allowance,
      alloc: dists.alloc,
      // a subquery, not a join: nothing keeps a dist to one payout row, and a
      // second would count the dist twice. any one, as `dists_for_refund` takes
      payout_type: sql<PayoutType | null>`(SELECT ${payouts.type} FROM ${payouts}
        WHERE ${payouts.source_id} = ${dists.id} AND ${payouts.source} = 'donation'
        LIMIT 1)`,
      commission: {
        amount: referrer_commissions.amount,
        status: referrer_commissions.status,
        referrer_user: referrer_commissions.referrer_user,
        referrer_npo: referrer_commissions.referrer_npo,
      },
    })
    .from(dists)
    .leftJoin(
      referrer_commissions,
      eq(referrer_commissions.donation_id, dists.id)
    )
    .where(where)
    .orderBy(asc(dists.id))
    .for("update", { of: dists });
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    refund_status: r.refund_status,
    to_id: r.to_id ?? 0,
    to_name: r.to_name ?? "",
    net: r.net ?? 0,
    fee_base: r.fee_base ?? 0,
    fee_fsa: r.fee_fsa ?? 0,
    fee_processing: r.fee_processing ?? 0,
    fee_allowance: r.fee_allowance ?? 0,
    cash_pct: r.alloc?.cash ?? 0,
    payout_type: r.payout_type,
    commission: r.commission,
  }));
}

/** whether the dist's grant has gone out: a payout of its cash share no
 * longer pending, as the refund plan judges it a loss */
export const grant_went_out = (d: LockedDist) =>
  d.cash_pct > 0 && d.payout_type !== null && d.payout_type !== "pending";

type OwedShare = Pick<
  IOwedRecord,
  "party" | "received_usd" | "fee_processing_usd" | "fee_dispute_usd"
>;

/** one figure per party: for each dist `owes` picks, its npo owes `f` of
 * what the dist received and of its card fee, plus its part of the dispute
 * fee by settled amount, in full; each referrer `f` of its paid commissions */
export function owed_shares(
  ds: LockedDist[],
  o: { f: number; fee_usd: number; owes: (d: LockedDist) => boolean }
): OwedShare[] {
  const fee_shares = split_cents(o.fee_usd, ds.map(dist_settled_usd));
  const by_party = new Map<string, OwedShare>();
  const add = (key: string, s: OwedShare) => {
    const was = by_party.get(key);
    by_party.set(
      key,
      was
        ? {
            party: s.party,
            received_usd: was.received_usd + s.received_usd,
            fee_processing_usd: was.fee_processing_usd + s.fee_processing_usd,
            fee_dispute_usd:
              (was.fee_dispute_usd ?? 0) + (s.fee_dispute_usd ?? 0),
          }
        : s
    );
  };
  for (const [i, x] of ds.entries()) {
    if (o.owes(x)) {
      add(`npo:${x.to_id}`, {
        party: { npo_id: x.to_id },
        received_usd: scaled(x.net, o.f),
        fee_processing_usd: scaled(fee_processing_usd(x), o.f),
        fee_dispute_usd: fee_shares[i]!,
      });
    }
    const c = x.commission;
    if (c?.status !== "paid") continue;
    const party = referrer_of(c);
    add(`ref:${JSON.stringify(party)}`, {
      party,
      received_usd: scaled(c.amount, o.f),
      fee_processing_usd: 0,
    });
  }
  return [...by_party.values()];
}

/** `usd` split in whole cents in proportion to `weights`, the cents rounding
 * leaves going to the largest remainders, so the shares sum to `usd` */
function split_cents(usd: number, weights: number[]): number[] {
  const cents = Math.round(usd * 100);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (cents * w) / total);
  const shares = exact.map(Math.floor);
  let left = cents - shares.reduce((s, c) => s + c, 0);
  const by_remainder = exact
    .map((e, i) => [e - shares[i]!, i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of by_remainder) {
    if (left-- <= 0) break;
    shares[i]! += 1;
  }
  return shares.map((c) => c / 100);
}
