import {
  donation_private_message as dpm,
  donation_tribute_notif as dtn,
} from "emails";
import type { IDonation } from "@/donations";
import { report_error } from "@/errors/report";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { from_full } from "@/helpers/name";
import { send_email } from "$/email";
import {
  claim_receipt_send,
  mark_receipt_sent,
  release_receipt_send,
} from "$/pg/queries/donation";
import { npo_admins } from "$/pg/queries/user";
import { send_receipt } from "./send-receipt";

export async function handle_don_receipt(don: IDonation) {
  // the stamp goes first and the loser stops here. every provider's settle
  // path queues this message, and a redelivery of it — from qstash or from the
  // provider handler re-queueing after a failed enqueue — would otherwise
  // re-mail the receipt under a fresh tax id, and the private-message and
  // tribute mails below with it.
  //
  // not an error: a redelivery of a message whose receipts already went out.
  // qstash needs a 200 for it or it will keep retrying.
  if (!(await claim_receipt_send(don.id))) return;

  // the claim is a lease, and the "sent" stamp below is what ends it. it is
  // taken before the sends so nothing concurrent can mail the donor twice, and
  // given back if any of them throws — a provider refusal on one mail must not
  // permanently consume the right to send the rest. do not "simplify" the
  // release away, and do not move the stamp back up to the claim: either one
  // makes the first transient failure cost the donor their receipt for good,
  // with the row asserting it was sent.
  //
  // a holder that cannot reach the release at all — a function killed
  // mid-send — is covered by the claim's own expiry, not by anything here.
  //
  // what the lease does not cover: `sends` is several mails and the release is
  // all-or-nothing, so a failure partway through gives back the right to send
  // the ones that already went. a tipped npo donation or a multi-member fund
  // that dies on mail #3 re-sends #1 and #2 on the retry, the receipt among
  // them under a fresh tax id. it is still strictly better than the state
  // before it, where every redelivery re-sent everything; closing the rest
  // means making the receipt number deterministic per donation, which is
  // tracked separately.
  try {
    await sends(don);
  } catch (e) {
    // the release is best-effort and the send failure is the one that has to
    // survive: letting a db error thrown here replace it puts the wrong
    // exception in sentry and loses the reason the donor never got the
    // receipt. reported separately because the lease then stays held until it
    // expires, which delays every later attempt at this donation's receipt.
    await release_receipt_send(don.id).catch((re) =>
      report_error(re, { donation_id: don.id, during: "receipt lease release" })
    );
    throw e;
  }

  // outside the try on purpose. inside it, a db failure on this write would
  // land in the catch and *release* the lease — handing the next delivery the
  // right to re-mail receipts that already went out, under a fresh tax id.
  // left here it throws with the lease still held, so nothing re-sends until
  // the expiry, and the mails that did go out stay sent exactly once.
  await mark_receipt_sent(don.id);
}

async function sends(don: IDonation) {
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
