import { fnd_mgmt_lock_tx as email } from "emails";
import { emails } from "@/constants/common";
import { to_pretty_utc } from "@/helpers/date";
import { rd } from "@/helpers/decimal";
import type { ILockTxCreatedPayload } from "@/queue";
import { send_email } from "$/email";
import { npo_get } from "$/pg/queries/npo";

// emitter already filters for lock account, non-dividend, non-refund
export async function handle_lock_tx_created(data: ILockTxCreatedPayload) {
  const change = Number(data.bal_end) - Number(data.bal_begin);
  if (change === 0) return;

  const npo = await npo_get(data.npo_id);
  const type = change > 0 ? "invest" : "redeem";

  const d: email.IData = {
    amount: rd(Number(data.amount)),
    type,
    transactor: npo?.name ?? "Unknown NPO",
    date: to_pretty_utc(
      typeof data.date_created === "string"
        ? data.date_created
        : data.date_created.toISOString()
    ),
  };
  const { node, subject } = email.template(d);

  const res = await send_email({
    node,
    subject,
    to: Object.values(emails),
  });
  console.info("sent lock tx email:", res);
}
