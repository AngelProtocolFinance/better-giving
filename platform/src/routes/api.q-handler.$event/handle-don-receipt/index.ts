import {
  donation_private_message as dpm,
  donation_tribute_notif as dtn,
} from "@better-giving/react-emails";
import type { IDonation } from "@/donations";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { from_full } from "@/helpers/name";
import { send_email } from "$/email";
import { npo_admins } from "$/pg/queries/user";
import { send_receipt } from "./send-receipt";

export async function handle_don_receipt(don: IDonation) {
  await send_receipt(don);

  // private message email
  if (don.from_private_msg_to_npo) {
    const adms = await npo_admins(+don.to_id).then((as) =>
      as.map((a) => a.email)
    );

    const data: dpm.IData = {
      id: don.id,
      amount: to_amount(
        don.amount.base,
        don.amount.base / don.upusd,
        don.currency
      ),
      date: to_pretty_utc(don.created_at),
      to_name: don.to_name,
      from: {
        first_name: from_full(don.from_name).fn || "Anonymous",
        full_name: don.from_name || "Anonymous",
      },
      message: don.from_private_msg_to_npo,
    };
    const { node, subject } = dpm.template(data);

    const res = await send_email({ node, subject, to: adms });
    console.info("sent private message to npo admins:", res.data?.id, data);
  }

  // tribute notification email
  if (don.tribute?.notif) {
    const data: dtn.IData = {
      to_name: don.to_name,
      in_honor_of: don.tribute.full_name,
      notif_to_full_name: don.tribute.notif.to_fullname,
      from: {
        first_name: from_full(don.from_name).fn ?? "Anonymous",
        full_name: don.from_name ?? "Anonymous",
      },
      from_msg: don.tribute.notif.from_msg,
      amount: to_amount(
        don.amount.base,
        don.amount.base / don.upusd,
        don.currency
      ),
    };
    const { node, subject } = dtn.template(data);

    const res = await send_email({
      node,
      to: [don.tribute.notif.to_email],
      subject,
    });
    console.info("sent tribute notification:", res.data?.id, data);
  }
}
