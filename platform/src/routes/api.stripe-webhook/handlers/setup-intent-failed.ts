import { donation_error as email } from "@better-giving/react-emails";
import type Stripe from "stripe";
import type { IMetadata } from "@/stripe";
import { send_email } from "$/email";
import { donation_get } from "$/pg/queries/donation";

export async function handle_setup_intent_failed(
  data: Stripe.SetupIntentSetupFailedEvent.Data
) {
  const meta = data.object.metadata as IMetadata | null;
  if (!meta) throw new Error("missing setup intent metadata");

  const order = await donation_get(meta.order_id);
  if (!order) throw new Error(`Order ${meta.order_id} not found`);

  const err = data.object.last_setup_error;
  if (err?.type === "card_error") return; // already handled in frontend

  const message = `Setup Intent ID ${data.object.id} failed due to: ${err?.message ?? "Stripe error"}`;

  const x: email.IData = {
    recipient_name: order.to_name,
    donor_first_name: order.from_name?.split(" ")[0] ?? "Donor",
    error_message: message,
  };
  const { node, subject } = email.template(x);

  await send_email({ node, subject, to: [meta.email] });
}
