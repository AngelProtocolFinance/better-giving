import { fund_opt_out_notif } from "@better-giving/react-emails";
import { report_error } from "@/errors/report";
import type { IFundMemberRemovedPayload } from "@/queue";
import { send_email } from "$/email";
import { npo_get } from "$/pg/queries/npo";

export async function handle_fund_member_removed(
  data: IFundMemberRemovedPayload
) {
  for (const npo_id of data.removed_npo_ids) {
    const npo = await npo_get(npo_id);
    if (!npo) continue;
    const { node, subject } = fund_opt_out_notif.template({
      to_name: data.creator_name,
      opted_out_name: npo.name,
    });
    try {
      const res = await send_email({
        node,
        subject,
        to: [data.creator_id],
      });
      console.info("sent opt-out email:", res);
    } catch (err) {
      report_error(err, { fund_id: data.fund_id, npo_id });
    }
  }
}
