import { and, desc, eq, isNotNull } from "drizzle-orm";
import Stripe from "stripe";
import { report_degraded } from "#/errors/report";
import { to_units } from "@/helpers/decimal";
import {
  type ISentTransfer,
  type ISentTransfers,
  transfer_standing,
} from "@/stripe-connect/sent";
import { stripe } from "../kit/stripe";
import { db } from "../pg/db";
import { dists } from "../pg/schema/dist";
import { npos } from "../pg/schema/npo";

/** one retrieve per transfer; past this the page names that it stopped */
const SENT_LIMIT = 100;

interface ITransferRow {
  id: string;
  net: number | null;
  date: string;
}

/** a transfer as stripe returns it, the fields this page reads */
interface ITransferRecord {
  id: string;
  amount: number;
  amount_reversed: number;
  created: number;
  reversals?: {
    data: { amount: number }[];
    has_more: boolean;
  };
}

/**
 * routed transfers paid to `npo_id`, newest first, each with what its
 * reversal records took back. null when the nonprofit is not on Connect and
 * has none: the payouts page stays as it is. an empty list is a connected
 * nonprofit nothing has been sent to yet
 */
export async function npo_sent_transfers(
  npo_id: number
): Promise<ISentTransfers | null> {
  const [npo, rows] = await Promise.all([
    db
      .select({
        acct: npos.stripe_account_id,
        deauthorized_at: npos.stripe_deauthorized_at,
      })
      .from(npos)
      .where(eq(npos.id, npo_id))
      .then((r) => r[0]),
    db
      .select({
        id: dists.stripe_transfer_id,
        net: dists.net,
        date: dists.date_created,
      })
      .from(dists)
      .where(and(eq(dists.to_id, npo_id), isNotNull(dists.stripe_transfer_id)))
      .orderBy(desc(dists.date_created), desc(dists.id))
      .limit(SENT_LIMIT + 1),
  ]);

  const connected = !!npo?.acct && npo.deauthorized_at === null;
  if (!connected && rows.length === 0) return null;

  const truncated = rows.length > SENT_LIMIT;
  const listed = rows
    .slice(0, SENT_LIMIT)
    .flatMap((row) =>
      row.id === null ? [] : [{ id: row.id, net: row.net, date: row.date }]
    );
  const items = await Promise.all(listed.map((row) => sent_of(npo_id, row)));
  items.sort((a, b) => b.date.localeCompare(a.date));
  return { items, truncated };
}

/** cents the transfer's reversal records add up to. an incomplete page of
 * them is not a total, so the transfer's own reversed amount — stripe's sum
 * of every reversal — stands in */
function reversal_cents(tr: ITransferRecord): number {
  const list = tr.reversals;
  if (!list || list.has_more) return tr.amount_reversed;
  return list.data.reduce((sum, r) => sum + r.amount, 0);
}

async function sent_of(
  npo_id: number,
  row: ITransferRow
): Promise<ISentTransfer> {
  try {
    const tr = (await stripe.transfers.retrieve(row.id, {
      expand: ["reversals"],
    })) as ITransferRecord;
    const standing = transfer_standing(tr.amount, reversal_cents(tr));
    return {
      id: tr.id,
      amount: tr.amount / 100,
      date: new Date(tr.created * 1000).toISOString(),
      standing,
    };
  } catch (err) {
    // a miss here is stripe, not this page: the amount we sent is on the
    // dist, and a standing we could not read is not "paid out"
    if (!(err instanceof Stripe.errors.StripeError)) throw err;
    report_degraded(err, { npo_id, transfer_id: row.id });
    return {
      id: row.id,
      // usd the transfer sent: the same cents a payout of this net would, as usd
      amount: to_units(row.net ?? 0, 2, "half_down") / 100,
      date: row.date,
      standing: { kind: "unknown" },
    };
  }
}
