import type { DbOrTx } from "../pg/queries/helpers";
import {
  type IOwed,
  type OwedParty,
  owed_for_party,
  record_owed,
} from "../pg/queries/owed";
import { refund_failed_ref } from "../pg/queries/owed-refund";
import {
  type ITake,
  take_add,
  take_undo,
  take_update,
  takes_of,
} from "../pg/queries/take";
import type { OwedSource } from "./apply";
import { dist_settled_usd } from "./plan";
import {
  type CreditPart,
  credit_parts,
  grant_went_out,
  type LockedDist,
  type OwedShare,
  owed_shares,
  split_cents,
} from "./share";

const active = (t: ITake) => t.status === "active";
const same_share = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/** how much of the charge the active takes take back, at most the whole;
 * of the disputes only, with `kind` */
export const taken_of = (takes: ITake[], kind?: ITake["kind"]) =>
  Math.min(
    takes
      .filter((t) => active(t) && (!kind || t.kind === kind))
      .reduce((sum, t) => sum + t.share, 0),
    1
  );

const party_key = (p: OwedParty) => JSON.stringify(p);

/**
 * what each party owes for the active takes. an npo whose grant has gone out
 * owes the share they all take of what it received and of its card fee; one
 * whose grant hasn't owes the disputes' share only, a refund there being ops'
 * to settle by hand. each active dispute's fee is owed in full, split over
 * the dists by settled amount, and each referrer owes the whole share of its
 * paid commission
 */
export function owed_targets(
  ds: LockedDist[],
  takes: ITake[]
): Map<string, OwedShare> {
  const all = taken_of(takes);
  const disputes = taken_of(takes, "dispute");
  const weights = ds.map(dist_settled_usd);
  const fees = ds.map(() => 0);
  for (const t of takes.filter((t) => active(t) && t.fee_usd > 0)) {
    for (const [i, c] of split_cents(t.fee_usd, weights).entries()) {
      fees[i]! += c;
    }
  }
  return new Map(
    owed_shares(ds, {
      f: all,
      f_of: (d) => (grant_went_out(d) ? all : disputes),
      fee_usd: fees,
      owes: () => true,
    }).map((s) => [party_key(s.party), s])
  );
}

export interface OwedMove {
  party: OwedParty;
  /** the row before anything was credited back; none when the party owed
   * nothing */
  was: IOwed | undefined;
  /** the row as it stands after; none when the party owes nothing */
  row: IOwed | undefined;
  /** what the take that gave its part back took off the row, and what it
   * would have but for what the row could still be credited */
  credited: number;
  wanted: number;
}

/** the take that gave back part of what it took between `before` and
 * `after`: undone, or shrunk by its chargeback */
const given_back = (before: ITake[], after: ITake[]) =>
  after.find((t) => {
    const b = before.find((x) => x.id === t.id);
    return b && active(b) && (!active(t) || t.share < b.share);
  });

/**
 * moves each party's row from what the takes `before` owe to what the takes
 * `after` owe: a figure that rises is recorded, one that falls is credited
 * back under the take that gave its part back, each by the difference of
 * the two floors, so no cent of another take moves
 */
export async function move_owed(
  tx: DbOrTx,
  m: {
    donation_id: string;
    ds: LockedDist[];
    before: ITake[];
    after: ITake[];
    src: OwedSource;
    now: string;
  }
): Promise<OwedMove[]> {
  const was = owed_targets(m.ds, m.before);
  const now = owed_targets(m.ds, m.after);
  const fallen = given_back(m.before, m.after);
  const moves: OwedMove[] = [];
  for (const key of new Set([...was.keys(), ...now.keys()])) {
    const a = now.get(key);
    const b = was.get(key);
    const party = (a ?? b)!.party;
    const fig = (s: OwedShare | undefined) => ({
      r: s?.received_usd ?? 0,
      p: s?.fee_processing_usd ?? 0,
      f: s?.fee_dispute_usd ?? 0,
    });
    const [x, y] = [fig(b), fig(a)];
    let row = await owed_for_party(m.donation_id, party, tx);
    if (y.r > x.r || y.p > x.p || y.f > x.f) {
      row = await record_owed(tx, {
        party,
        donation_id: m.donation_id,
        received_usd: y.r,
        fee_processing_usd: y.p,
        fee_dispute_usd: y.f,
        ...m.src,
        now: m.now,
      });
    }
    const before_credit = row;
    let credited = 0;
    let wanted = 0;
    if (fallen && row && (y.r < x.r || y.p < x.p || y.f < x.f)) {
      const parts = undo_parts(fallen, {
        r: x.r - y.r,
        p: x.p - y.p,
        f: x.f - y.f,
      });
      wanted = parts.reduce((sum, [, usd]) => sum + Math.max(usd, 0), 0);
      const after = await credit_parts(
        tx,
        row,
        { donation_id: m.donation_id, party, now: m.now },
        parts
      );
      credited = after.credited_back_usd - row.credited_back_usd;
      row = after;
    }
    moves.push({ party, was: before_credit, row, credited, wanted });
  }
  return moves;
}

/** the credits a take's fall is booked under, one per figure, each keyed on
 * the take so a redelivery adds nothing: a dispute shrunk by its chargeback
 * on that chargeback, so its later win books apart */
function undo_parts(
  t: ITake,
  fall: { r: number; p: number; f: number }
): CreditPart[] {
  if (t.kind === "refund") {
    return [
      ["refund_failed", fall.r, refund_failed_ref(t.ref)],
      ["refund_failed_fee", fall.p, `refund_failed_fee:${t.ref}`],
    ];
  }
  const id = active(t)
    ? `${t.id}:${t.chargeback_ref}`
    : (t.dispute_id ?? t.ref);
  return [
    ["dispute_won", fall.r, id],
    ["dispute_won_fee", fall.p, `${id}:fee`],
    ["dispute_won_fee_dispute", fall.f, `${id}:fee_dispute`],
  ];
}

/** the open claim a refund of `share` pays: an active dispute of the same
 * part with no chargeback, which the refund's own take then counts instead */
export const claim_paid = (takes: ITake[], share: number) =>
  takes.find(
    (t) =>
      active(t) &&
      t.kind === "dispute" &&
      t.chargeback_ref === null &&
      same_share(t.share, share)
  );

/** a refund's take, its own part of the charge, undoing the open claim it
 * pays; a redelivery's is on record */
export async function take_refund(
  tx: DbOrTx,
  donation_id: string,
  ref: string,
  share: number
) {
  if (share <= 0) return;
  const takes = await takes_of(tx, donation_id);
  if (takes.some((t) => t.ref === ref)) return;
  const claim = claim_paid(takes, share);
  if (claim) await take_undo(tx, donation_id, claim.ref);
  await take_add(tx, {
    donation_id,
    ref,
    kind: "refund",
    share: Math.min(share, 1),
  });
}

/**
 * a chargeback onto its dispute's take: a redelivery finds its take by its
 * own ref; else the dispute it names, else the dispute filed on the gift
 * whose own part it matches, won or not (its chargeback delivered late),
 * else the latest open one; with none, a take of its own the filing claims
 */
export async function take_chargeback(
  tx: DbOrTx,
  c: {
    donation_id: string;
    ref: string;
    share: number;
    fee_usd: number;
    dispute_id?: string;
  }
) {
  const takes = await takes_of(tx, c.donation_id);
  if (takes.some((t) => t.chargeback_ref === c.ref)) return;
  const filed = takes.filter(
    (t) =>
      t.kind === "dispute" && t.dispute_id !== null && t.chargeback_ref === null
  );
  const own = c.dispute_id
    ? takes.find((t) => t.ref === c.dispute_id)
    : (filed.find((t) => same_share(t.share, c.share)) ??
      filed.filter(active).at(-1));
  if (own) {
    await take_update(tx, own.id, {
      chargeback_ref: c.ref,
      share: Math.min(c.share, 1),
      fee_usd: Math.max(own.fee_usd, c.fee_usd),
    });
    return;
  }
  await take_add(tx, {
    donation_id: c.donation_id,
    ref: c.dispute_id ?? c.ref,
    kind: "dispute",
    share: Math.min(c.share, 1),
    fee_usd: c.fee_usd,
    dispute_id: c.dispute_id ?? null,
    chargeback_ref: c.ref,
  });
}

/** the chargeback recorded before its dispute was filed that a dispute of
 * `share` is: the one of the same part, or with the dispute unsized, the
 * oldest */
const orphan_of = (takes: ITake[], share: number | null) => {
  const orphans = takes.filter(
    (t) => active(t) && t.kind === "dispute" && t.dispute_id === null
  );
  return share === null
    ? orphans[0]
    : orphans.find((t) => same_share(t.share, share));
};

/** a dispute's take on record, claiming its chargeback recorded before it */
export async function dispute_take(
  tx: DbOrTx,
  d: { donation_id: string; dispute_id: string; share: number | null }
): Promise<ITake | undefined> {
  const takes = await takes_of(tx, d.donation_id);
  const own = takes.find((t) => t.ref === d.dispute_id);
  if (own) return own;
  const orphan = orphan_of(takes, d.share);
  if (!orphan) return undefined;
  await take_update(tx, orphan.id, {
    ref: d.dispute_id,
    dispute_id: d.dispute_id,
  });
  return { ...orphan, ref: d.dispute_id, dispute_id: d.dispute_id };
}

/**
 * a dispute filed: its take, or the chargeback of it recorded before it,
 * which it claims. `share` null is a filing that can't be sized: it claims
 * the oldest such chargeback, else takes the rest of the charge. its own part
 * stands once on record; a later filing of it only raises the fee
 */
export async function take_dispute(
  tx: DbOrTx,
  d: {
    donation_id: string;
    dispute_id: string;
    share: number | null;
    fee_usd: number;
  }
) {
  const own = await dispute_take(tx, d);
  if (own) {
    if (d.fee_usd > own.fee_usd) {
      await take_update(tx, own.id, { fee_usd: d.fee_usd });
    }
    return;
  }
  const share =
    d.share ?? Math.max(1 - taken_of(await takes_of(tx, d.donation_id)), 0);
  if (share <= 0) return;
  await take_add(tx, {
    donation_id: d.donation_id,
    ref: d.dispute_id,
    kind: "dispute",
    share: Math.min(share, 1),
    fee_usd: d.fee_usd,
    dispute_id: d.dispute_id,
  });
}
