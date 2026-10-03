import type { donation_receipt, IDonor } from "emails";
import { type IDonation, tax_receipt_id } from "@/donations";
import { to_receipt } from "@/helpers/email";
import { app, base_url } from "./env";
import { npo_get } from "./pg/queries/npo";

export class NpoNotFoundError extends Error {
  constructor(npo_id: string) {
    super(`NPO not found: ${npo_id}`);
    this.name = "NpoNotFoundError";
  }
}

/**
 * the gift's one receipt, as the queue send and the dashboard resend both mail
 * it. a fund gift names the fund, never its members: nothing records the set a
 * split meant to pay, so no read of its dists can tell one still landing from
 * one skipped, and the donor gave to the fund.
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
    base_url,
  };

  if (d.to_type === "npo") {
    const npo = await npo_get(+d.to_id);
    if (!npo) throw new NpoNotFoundError(d.to_id);
    return to_receipt(d, [npo.id], [npo], ctx);
  }
  return to_receipt(d, [0], [{ id: 0, name: d.to_name }], ctx);
}
