import type { donation_receipt, IDonor } from "emails";
import { type IDonation, tax_receipt_id } from "@/donations";
import { to_receipt } from "@/helpers/email";
import { app } from "./env";
import { dist_shares_of } from "./pg/queries/dist";
import { npo_get, npos_batch_get } from "./pg/queries/npo";

export class NpoNotFoundError extends Error {
  constructor(npo_id: string) {
    super(`NPO not found: ${npo_id}`);
    this.name = "NpoNotFoundError";
  }
}

/** a fund gift whose split may still be writing its dists */
export class ReceiptNotReadyError extends Error {
  constructor(donation_id: string) {
    super(`split still distributing: ${donation_id}`);
    this.name = "ReceiptNotReadyError";
  }
}

/** how long after settlement a fund's split may still be landing its dists */
const SPLIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * the gift's one receipt, as the queue send and the dashboard resend both mail
 * it. a fund gift names the members its dists paid (`fund_paid_ids`), and
 * throws `ReceiptNotReadyError` while the split may still be landing them.
 */
export async function build_receipt(
  d: IDonation,
  from: IDonor
): Promise<donation_receipt.IData> {
  const ctx = {
    from,
    // derived from the donation, so a resend carries the number the donor
    // already has. chariot receipts are issued by the daf, not by us.
    tax_receipt_id: d.via.startsWith("chariot")
      ? undefined
      : await tax_receipt_id(d.id),
    bg_npo_id: +app.npo_id,
  };

  if (d.to_type === "npo") {
    const npo = await npo_get(+d.to_id);
    if (!npo) throw new NpoNotFoundError(d.to_id);
    return to_receipt(d, [npo.id], [npo], ctx);
  }

  const paid_ids = await fund_paid_ids(d);
  if (paid_ids) {
    return to_receipt(d, paid_ids, await npos_batch_get(paid_ids), ctx);
  }
  // a split that stopped short: the gift went to the fund, which is always
  // true, and the full amount stays on one line rather than being spread over
  // the members who got only their share of it
  return to_receipt(d, [0], [{ id: 0, name: d.to_name }], ctx);
}

/**
 * the members a fund gift's receipt names: those its dists paid, the only
 * record of who got money. the split picks members and then writes one dist
 * each on another queue, skipping any that went inactive in between, so
 * neither its pick nor the fund's membership now will do.
 *
 * - whole: the dists' shares add up to the gift, so every one has landed.
 * - short, within `SPLIT_WINDOW_MS` of settlement: may still be landing,
 *   `ReceiptNotReadyError`.
 * - short, past it: the split is not coming. `null`: the receipt names the
 *   fund, since no set of members adds up to what the donor gave.
 */
export async function fund_paid_ids(d: IDonation): Promise<number[] | null> {
  const shares = await dist_shares_of(d.id);
  const paid_ids = shares.map((s) => s.to_id);
  // each dist is base/n, so a whole split sums back to base within float error
  const sum = shares.reduce((acc, s) => acc + s.amount, 0);
  const whole =
    shares.length > 0 && Math.abs(sum - d.amount.base) <= d.amount.base * 1e-6;
  if (whole) return paid_ids;

  const settled_at = d.settlement?.date;
  if (settled_at && Date.now() - Date.parse(settled_at) < SPLIT_WINDOW_MS) {
    throw new ReceiptNotReadyError(d.id);
  }
  return null;
}
