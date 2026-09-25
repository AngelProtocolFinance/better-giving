import { fund_opt_out_notif } from "emails";
import { report_error } from "#/errors/report";
import type { IFundMemberRemovedPayload } from "@/queue";
import { send_email_or_throw } from "$/email";
import { npo_get } from "$/pg/queries/npo";
import { user_contact_by_id } from "$/pg/queries/user";

export async function handle_fund_member_removed(
  data: IFundMemberRemovedPayload
) {
  // `creator_id` is a `user.id`; the payload's `creator_name` is the fund's name
  const creator = await user_contact_by_id(data.creator_id);
  if (!creator) {
    // a retry cannot conjure the row, so throwing would only walk qstash into the dlq
    report_error(new Error("fund creator has no user row"), {
      fund_id: data.fund_id,
      creator_id: data.creator_id,
    });
    return;
  }

  for (const npo_id of data.removed_npo_ids) {
    const npo = await npo_get(npo_id);
    if (!npo) continue;
    const { node, subject } = fund_opt_out_notif.template({
      to_name: creator.first_name,
      opted_out_name: npo.name,
    });
    const res = await send_email_or_throw({
      node,
      subject,
      to: [creator.email],
    });
    console.info("sent opt-out email:", res);
  }
}
