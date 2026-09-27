import type { donation_receipt, IDonor } from "emails";
import { type IDonation, tax_receipt_id } from "@/donations";
import { to_receipt } from "@/helpers/email";
import { is_funded_member } from "@/settlement/funded-members";
import { app } from "./env";
import { dist_npo_ids_of } from "./pg/queries/dist";
import { npo_get, npos_batch_get } from "./pg/queries/npo";

export class NpoNotFoundError extends Error {
  constructor(npo_id: string) {
    super(`NPO not found: ${npo_id}`);
    this.name = "NpoNotFoundError";
  }
}

/**
 * the gift's one receipt, as the queue send and the dashboard resend both mail
 * it. `at` is when it is built, and it decides a fund gift's members:
 *
 * - `settlement`: queued beside the split and run within seconds of it, so it
 *   lists the funded members now, as `partition_destinations` picks them. the
 *   dists are ignored: the fan-out commits them one at a time, and a partial
 *   set would truncate the list.
 * - `resend`: any time later, when membership may have moved. the paid dists
 *   are the record and win whenever any exist; the funded members only when
 *   the split never wrote one.
 */
export async function build_receipt(
  d: IDonation,
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

  const paid_ids = at === "resend" ? await dist_npo_ids_of(d.id) : [];
  if (paid_ids.length) {
    return to_receipt(d, paid_ids, await npos_batch_get(paid_ids), ctx);
  }
  const members = await npos_batch_get(d.to_members.map((x) => +x));
  const funded = members.filter(is_funded_member).map((n) => n.id);
  return to_receipt(d, funded, members, ctx);
}
