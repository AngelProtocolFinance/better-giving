import { banking } from "emails";
import type { IBankingPayload } from "@/queue";
import { send_email } from "$/email";
import { npo_admins } from "$/pg/queries/user";

async function send_banking_email(
  npo_id: number,
  template_data: Parameters<typeof banking.template>[0]
) {
  const admins = await npo_admins(npo_id);
  if (admins.length === 0) return;
  const { node, subject } = banking.template(template_data);
  await send_email({ node, subject, to: admins.map((a) => a.email) });
}

export async function handle_banking_new_account(data: IBankingPayload) {
  await send_banking_email(data.npo_id, {
    action: "new",
    account_summary: data.bank_summary ?? "",
  });
}

export async function handle_banking_approved(data: IBankingPayload) {
  await send_banking_email(data.npo_id, {
    action: "approved",
    account_summary: data.bank_summary ?? "",
  });
}

export async function handle_banking_rejected(data: IBankingPayload) {
  await send_banking_email(data.npo_id, {
    action: "rejected",
    account_summary: data.bank_summary ?? "",
    rejection_reason: data.rejection_reason,
  });
}

export async function handle_banking_set_default(data: IBankingPayload) {
  await send_banking_email(data.npo_id, {
    action: "default",
    account_summary: data.bank_summary ?? "",
  });
}
