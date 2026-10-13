import { and, eq, isNotNull, sql } from "drizzle-orm";
import { report_error } from "#/errors/report";
import { humanize } from "@/helpers/decimal";
import { stripe } from "../kit/stripe";
import { db } from "../pg/db";
import { dists } from "../pg/schema/dist";
import type { RoutedRefunds } from "../refund/reverse";
import { credit_unreversed, owe_unreversed } from "../refund/takes";
import { is_refusal } from "./refusal";

interface IRoutedTransfer {
  donation_id: string;
  dist_id: string;
  npo_id: number;
  transfer_id: string;
}

/** a refund's own cut of a transfer of `transferred` cents */
interface ICut {
  refund_id: string;
  amount: number;
}

/**
 * each refund's cut of the transfer, in proportion to its part of the charge,
 * to the nearest cent. cut off the running total, oldest refund first, so the
 * cuts sum to what the refunds take together and a fully refunded charge
 * reverses the whole transfer; ties on time break on the id, so every run
 * cuts alike
 */
function refund_cuts(transferred: number, c: RoutedRefunds): ICut[] {
  const oldest_first = [...c.refunds].sort(
    (a, b) =>
      (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
      a.id.localeCompare(b.id)
  );
  const cuts: ICut[] = [];
  let taken = 0;
  let cut_so_far = 0;
  for (const r of oldest_first) {
    taken = Math.min(taken + r.amount, c.of);
    const due = Math.round((transferred * taken) / c.of);
    cuts.push({ refund_id: r.id, amount: due - cut_so_far });
    cut_so_far = due;
  }
  return cuts;
}

/** the transfer's metadata key that records a refund's cut stripe refused to
 * reverse; keys are capped at 40 characters */
const SHORT = "short:";

/** cents of the transfer stripe refused to reverse, by refund */
const shortfalls = (metadata: Record<string, string> | null) =>
  new Map(
    Object.entries(metadata ?? {})
      .filter(([k]) => k.startsWith(SHORT))
      .map(([k, v]) => [k.slice(SHORT.length), Number(v)])
  );

/**
 * takes back from each connected account the gift's routed dists were paid
 * to the refunds' cut of its transfer. a separate transfer is untouched by a
 * refund of its charge (stripe's `reverse_transfer` reverses a destination
 * charge's own), so this is the only thing that takes the money back
 */
export async function reverse_routed_refunds(
  donation_id: string,
  c: RoutedRefunds
) {
  // the refund event that sees the last one sent reverses them all
  if (c.refunds.length === 0 || c.unsent.length > 0) return;
  for (const t of await transferred_of(donation_id)) {
    await reverse_refunded_share(t, c);
  }
}

/** the gift's dists a stripe transfer paid, whatever became of them since */
const transferred_of = async (donation_id: string) =>
  (
    await db
      .select({
        dist_id: dists.id,
        npo_id: sql<number>`${dists.to_id}`,
        npo_name: dists.to_name,
        transfer_id: sql<string>`${dists.stripe_transfer_id}`,
      })
      .from(dists)
      .where(
        and(
          eq(dists.donation_id, donation_id),
          isNotNull(dists.stripe_transfer_id)
        )
      )
  ).map((t) => ({ donation_id, ...t }));

/**
 * reverses each refund's cut of `t` once: a cut stripe has reversed, or
 * refused and was marked on the transfer, is answered already. a cut stripe
 * refuses (the account's balance can't cover it, the account is gone) is
 * marked and reported, and every marked cut is then recorded as owed by the
 * npo; the donor's refund stands either way. anything else throws, for the
 * caller to retry
 */
async function reverse_refunded_share(t: IRoutedTransfer, c: RoutedRefunds) {
  const tr = await stripe.transfers.retrieve(t.transfer_id);
  const { data: reversals } = await stripe.transfers.listReversals(
    t.transfer_id,
    { limit: 100 }
  );
  const short = shortfalls(tr.metadata);
  const answered = new Set([
    ...reversals.map((r) => r.metadata?.refund_id),
    ...short.keys(),
  ]);
  let left = tr.amount - tr.amount_reversed;

  for (const cut of refund_cuts(tr.amount, c)) {
    if (answered.has(cut.refund_id)) continue;
    // a reversal made by hand already took part of it back
    const amount = Math.min(cut.amount, left);
    if (amount <= 0) continue;
    try {
      await stripe.transfers.createReversal(
        t.transfer_id,
        {
          amount,
          metadata: {
            refund_id: cut.refund_id,
            dist_id: t.dist_id,
            donation_id: t.donation_id,
          },
        },
        { idempotencyKey: `connect-reversal:${cut.refund_id}:${t.dist_id}` }
      );
      left -= amount;
    } catch (e) {
      // as stripe threw it: the webhook route answers its transient errors
      // 503 for stripe's redelivery, unreported
      if (!is_refusal(e)) throw e;
      short.set(cut.refund_id, amount);
      // no later run asks stripe again for a cut marked here
      await stripe.transfers.update(t.transfer_id, {
        metadata: { [`${SHORT}${cut.refund_id}`]: String(amount) },
      });
      report_error(
        new Error(
          `${amount} cents of refund ${cut.refund_id} not reversed from transfer ${t.transfer_id}: recorded as owed by npo ${t.npo_id}`,
          { cause: e }
        ),
        {
          donation_id: t.donation_id,
          dist_id: t.dist_id,
          transfer_id: t.transfer_id,
          refund_id: cut.refund_id,
          stripe_code: e.code,
        }
      );
    }
  }
  // every cut marked refused, this run's and earlier ones', so a run that
  // died between a mark and this write has it recorded by the next. a
  // refund failed since is no longer among them: its credit stands
  const owed = [...short].filter(([id]) => c.refunds.some((r) => r.id === id));
  if (owed.length > 0) {
    await owe_unreversed({
      donation_id: t.donation_id,
      npo_id: t.npo_id,
      usd: owed.reduce((sum, [, cents]) => sum + cents, 0) / 100,
      source_ref: owed[0]![0],
    });
  }
}

/**
 * what the gift's routed dists had taken back for a refund that failed after
 * it succeeded, for ops: a cut reversed from a transfer is ours again and
 * the npo's to be paid back by hand; a cut stripe refused, recorded owed, is
 * credited back here. one line per dist, as `refund_failed` words them
 */
export async function routed_refund_failed(
  donation_id: string,
  refund_id: string
): Promise<string[]> {
  const lines: string[] = [];
  for (const t of await transferred_of(donation_id)) {
    const tr = await stripe.transfers.retrieve(t.transfer_id);
    const { data: reversals } = await stripe.transfers.listReversals(
      t.transfer_id,
      { limit: 100 }
    );
    const at = `dist ${t.dist_id} to ${t.npo_name || "its npo"} (npo ${t.npo_id})`;
    const reversed = reversals.find((r) => r.metadata?.refund_id === refund_id);
    if (reversed) {
      lines.push(
        `${at}: $${humanize(reversed.amount / 100)} reversed from transfer ${t.transfer_id} for this refund; re-pay it to the nonprofit by hand`
      );
    }
    const cents = shortfalls(tr.metadata).get(refund_id);
    if (cents) {
      await credit_unreversed({
        donation_id,
        npo_id: t.npo_id,
        usd: cents / 100,
        refund_id,
      });
      lines.push(
        `${at}: its $${humanize(cents / 100)} shortfall, which stripe refused to reverse from transfer ${t.transfer_id} and was recorded owed, is credited back`
      );
    }
  }
  return lines;
}
