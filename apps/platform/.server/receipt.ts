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
 * it.
 *
 * a fund gift lists the members settlement paid, active or not since; before
 * the split has run, the funded members it will pay.
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

  const paid_ids = await dist_npo_ids_of(d.id);
  const npos = await npos_batch_get(
    paid_ids.length ? paid_ids : d.to_members.map((x) => +x)
  );
  const ids = paid_ids.length
    ? paid_ids
    : npos.filter(is_funded_member).map((n) => n.id);
  return to_receipt(d, ids, npos, ctx);
}
