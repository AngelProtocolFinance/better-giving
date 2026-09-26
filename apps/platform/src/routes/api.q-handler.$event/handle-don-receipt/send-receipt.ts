import { donation_receipt, type IDonation as IDon, type IDonor } from "emails";
import { type IDonation, tax_receipt_id } from "@/donations";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount, to_fund_receipts } from "@/helpers/email";
import { is_funded_member } from "@/settlement/funded-members";
import { send_email_or_throw } from "$/email";
import { app } from "$/env";
import { npo_get, npos_batch_get } from "$/pg/queries/npo";

export const send_receipt = async (d: IDonation) => {
  const { base, tip } = d.amount;
  // derived from the donation, so a resend carries the number the donor
  // already has. chariot receipts are issued by the daf, not by us.
  const receipt_id = d.via.startsWith("chariot")
    ? undefined
    : await tax_receipt_id(d.id);
  const donor: IDonor = {
    first_name: d.from_name?.split(" ")[0] ?? "Donor",
    full_name: d.from_name ?? "Valued Donor",
    address: [
      d.from_addr_street,
      d.from_addr_city,
      d.from_addr_state,
      d.from_addr_zip_code,
      d.from_addr_country,
    ]
      .filter(Boolean)
      .join(", "),
  };

  if (tip > 0) {
    const amnt = to_amount(tip, tip / d.upusd, d.currency);
    const don: IDon = {
      id: d.id,
      date: to_pretty_utc(d.created_at),
      amount: amnt,
      to_name: "Better Giving",
    };
    const x: donation_receipt.IData = {
      ...don,
      tax_receipt_id: receipt_id,
      from: donor,
    };
    const { node, subject } = donation_receipt.template(x);
    const res = await send_email_or_throw({
      node,
      subject,
      to: [d.from_email],
    });
    console.info("sent tip receipt:", res.id, x);
  }

  if (d.to_type === "fund") {
    // queued beside the split, so it usually runs before settlement writes its
    // dists: the recipients are the members the split is paying
    const npos = await npos_batch_get(d.to_members.map((x) => +x));
    const ids = npos.filter(is_funded_member).map((n) => n.id);
    const receipts = to_fund_receipts(d, ids, npos, {
      from: donor,
      tax_receipt_id: receipt_id,
      bg_npo_id: +app.npo_id,
    });
    for (const x of receipts) {
      const { node, subject } = donation_receipt.template(x);
      const res = await send_email_or_throw({
        node,
        subject,
        to: [d.from_email],
      });
      console.info("sent receipt fund npo member:", res.id, x);
    }
    return;
  }

  d.to_type satisfies "npo";
  const npo = await npo_get(+d.to_id);
  if (!npo) throw new Error(`NPO not found: ${d.to_id}`);
  const don: IDon = {
    id: d.id,
    date: to_pretty_utc(d.created_at),
    amount: to_amount(base, base / d.upusd, d.currency),
    to_name: d.to_name,
  };

  const x: donation_receipt.IData = {
    ...don,
    from: donor,
    is_bg: npo.id === +app.npo_id,
    tax_receipt_id: receipt_id,
    to_msg_to_from: npo.receipt_msg ?? undefined,
  };
  const { node, subject } = donation_receipt.template(x);
  const res = await send_email_or_throw({ node, subject, to: [d.from_email] });
  console.info("sent npo receipt:", res.id, x);
};
