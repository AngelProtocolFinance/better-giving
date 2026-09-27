import type { donation_receipt, IDonor } from "emails";
import { type IDonation, tax_receipt_id } from "@/donations";
import { to_receipt } from "@/helpers/email";
import type { IDonSttlReceiptPayload } from "@/queue";
import { is_funded_member } from "@/settlement/funded-members";
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
 * it. `at` is when it is built, and it decides a fund gift's members:
 *
 * - `settlement`: queued by the split with `to_paid`, the members it pays, and
 *   lists exactly those. the dists are ignored: the fan-out commits them one at
 *   a time, and a partial set would truncate the list. a message without
 *   `to_paid` lists the funded members now.
 * - `resend`: any time later, when membership may have moved. the paid dists
 *   are the record once their shares add up to the gift. short of that, within
 *   `SPLIT_WINDOW_MS` of settlement the fan-out may still be landing, so it
 *   throws `ReceiptNotReadyError` rather than truncate the list.
 */
export async function build_receipt(
  d: IDonSttlReceiptPayload,
  from: IDonor,
  at: "settlement" | "resend"
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

  const paid_ids = at === "settlement" ? d.to_paid : await resend_paid_ids(d);
  if (paid_ids) {
    return to_receipt(d, paid_ids, await npos_batch_get(paid_ids), ctx);
  }
  const members = await npos_batch_get(d.to_members.map((x) => +x));
  const funded = members.filter(is_funded_member).map((n) => n.id);
  return to_receipt(d, funded, members, ctx);
}

/** the members a resend lists from the dists; none to list the funded ones */
async function resend_paid_ids(d: IDonation): Promise<number[] | undefined> {
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
  // past the window the split is not coming: one stuck short still names who
  // was paid, and one that wrote nothing found no funded member to pay
  return paid_ids.length ? paid_ids : undefined;
}
