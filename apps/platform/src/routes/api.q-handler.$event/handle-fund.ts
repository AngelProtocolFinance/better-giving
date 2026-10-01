import { fund_opt_out_notif } from "emails";
import { report_error } from "#/errors/report";
import type { IFundMemberRemovedPayload } from "@/queue";
import { send_email_or_throw } from "$/email";
import { npo_get } from "$/pg/queries/npo";
import { user_contact_by_id } from "$/pg/queries/user";

export async function handle_fund_member_removed(
  data: Omit<IFundMemberRemovedPayload, "npo_id"> & { npo_id?: number }
) {
  // `creator_id` is a `user.id`; the payload's `creator_name` is the fund's name
  const creator = await user_contact_by_id(data.creator_id);
  if (!creator) {
    // a retry cannot conjure the row, so throwing would only walk qstash into the dlq
    report_error(new Error("fund creator has no verified, unbanned user row"), {
      fund_id: data.fund_id,
      creator_id: data.creator_id,
    });
    return;
  }

  // one nonprofit per message, so a retry resends only the mail that failed
  const npo_id = data.npo_id ?? data.removed_npo_ids?.[0];
  const npo = npo_id === undefined ? undefined : await npo_get(npo_id);
  if (!npo) {
    report_error(new Error("opted-out nonprofit has no npo row"), {
      fund_id: data.fund_id,
      npo_id,
    });
    return;
  }
  const { node, subject } = fund_opt_out_notif.template({
    to_name: creator.first_name || "there",
    opted_out_name: npo.name,
  });
  const res = await send_email_or_throw({
    node,
    subject,
    to: [creator.email],
  });
  console.info("sent opt-out email:", res);
}
