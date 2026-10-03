import { admin_endow_admin_new } from "emails";
import type { IInviteEmailPayload } from "@/queue";
import { send_email_or_throw } from "$/email";
import { base_url } from "$/env";

export async function handle_invite(d: IInviteEmailPayload) {
  const { node, subject } = admin_endow_admin_new.template({
    first_name: d.invitee_first_name,
    invitor: d.invitor,
    endow_name: d.npo_name,
    base_url,
  });
  const res = await send_email_or_throw({
    node,
    subject,
    to: [d.invitee],
  });
  console.info("invite email sent:", res);
}
