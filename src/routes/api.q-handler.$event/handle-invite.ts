import { admin_endow_admin_new } from "@better-giving/react-emails";
import type { Payload as InvitePayload } from "@/queue/msgs/invite-email";
import { send_email } from "$/email";

export async function handle_invite(d: InvitePayload) {
  const { node, subject } = admin_endow_admin_new.template({
    first_name: d.invitee_first_name,
    invitor: d.invitor,
    endow_name: d.npo_name,
  });
  const res = await send_email({
    node,
    subject,
    to: [d.invitee],
  });
  console.info("invite email sent:", res);
}
