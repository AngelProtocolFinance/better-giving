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
 * a fund gift lists the members settlement paid, active or not since; until
 * the split has paid every funded member, the funded members it will pay. a
 * member inactive at the split and active again since reads as unpaid, and
 * gets a line.
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

  const [paid_ids, members] = await Promise.all([
    dist_npo_ids_of(d.id),
    npos_batch_get(d.to_members.map((x) => +x)),
  ]);
  // the split pays the funded members one dist each, committed one at a time:
  // a set missing any of them is a fan-out still running, not what was paid
  const funded = members.filter(is_funded_member).map((n) => n.id);
  const paid = new Set(paid_ids);
  const ids = funded.every((id) => paid.has(id)) ? paid_ids : funded;
  return to_receipt(d, ids, members, ctx);
}
