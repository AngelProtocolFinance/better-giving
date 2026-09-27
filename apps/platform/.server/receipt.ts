import type { donation_receipt, IDonor } from "emails";
import { type IDonation, tax_receipt_id } from "@/donations";
import { to_receipt } from "@/helpers/email";
import { is_funded_member } from "@/settlement/funded-members";
import { app } from "./env";
import { npo_get, npos_batch_get } from "./pg/queries/npo";

/**
 * the gift's one receipt, as the queue send and the dashboard resend both mail
 * it.
 *
 * `paid_ids` are the fund members settlement paid. empty — the split hasn't
 * run, or the caller doesn't read dists — receipts the funded members the
 * split will pay.
 */
export async function build_receipt(
  d: IDonation,
  from: IDonor,
  paid_ids: number[] = []
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
    if (!npo) throw new Error(`NPO not found: ${d.to_id}`);
    return to_receipt(d, [npo.id], [npo], ctx);
  }

  const npos = await npos_batch_get(
    paid_ids.length ? paid_ids : d.to_members.map((x) => +x)
  );
  const ids = paid_ids.length
    ? paid_ids
    : npos.filter(is_funded_member).map((n) => n.id);
  return to_receipt(d, ids, npos, ctx);
}
