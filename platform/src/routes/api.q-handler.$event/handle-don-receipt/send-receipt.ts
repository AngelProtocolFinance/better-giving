import { donation_receipt, type IDonation as IDon, type IDonor } from "emails";
import type { IDonation } from "@/donations";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { send_email } from "$/email";
import { app } from "$/env";
import { npo_get, npos_batch_get } from "$/pg/queries/npo";

export const send_receipt = async (d: IDonation) => {
  const { base, tip } = d.amount;
  const receipt_id = d.via.startsWith("chariot")
    ? undefined
    : crypto.randomUUID();
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
    const res = await send_email({ node, subject, to: [d.from_email] });
    console.info("sent tip receipt:", res.data?.id, x);
  }

  if (d.to_type === "fund") {
    const n = d.to_members.length;
    const amnt = to_amount(base / n, base / n / d.upusd, d.currency);
    const npos = await npos_batch_get(d.to_members.map((x) => +x));
    for (const npo of npos) {
      const don: IDon = {
        id: d.id,
        date: to_pretty_utc(d.created_at),
        amount: amnt,
        to_name: npo.name,
      };
      const x: donation_receipt.IData = {
        ...don,
        is_bg: npo.id === +app.npo_id,
        tax_receipt_id: receipt_id,
        to_msg_to_from: npo.receipt_msg ?? undefined,
        from: donor,
      };
      const { node, subject } = donation_receipt.template(x);
      const res = await send_email({ node, subject, to: [d.from_email] });
      console.info("sent receipt fund npo member:", res.data?.id, x);
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
  const res = await send_email({ node, subject, to: [d.from_email] });
  console.info("sent npo receipt:", res.data?.id, x);
};
