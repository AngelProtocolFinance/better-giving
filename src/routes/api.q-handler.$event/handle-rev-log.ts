import { tip_notif } from "@better-giving/react-emails";
import { emails } from "@/constants/common";
import { to_amount } from "@/helpers/email";
import type { Payload as TipPayload } from "@/queue/msgs/tip-received";
import { send_email } from "$/email";

// emitter already filters for tip-only — no guards needed here
export async function handle_tip_received(data: TipPayload) {
  const { node, subject } = tip_notif.template({
    id: data.id,
    date: data.date,
    amount: to_amount(
      data.type_tip.input,
      data.type_tip.input_usd,
      data.type_tip.denom
    ),
    to_name: data.npo_name,
    to_id: data.npo_id.toString(),
  });

  const res = await send_email({
    node,
    subject,
    to: Object.values(emails),
  });
  console.info("sent tip notif email:", res);
}
