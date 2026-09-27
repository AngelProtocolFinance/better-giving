import { valibotResolver } from "@hookform/resolvers/valibot";
import { donation_receipt as dr, type IDonor } from "emails";
import { getValidatedFormData } from "remix-hook-form";
import { user_ctx } from "#/.server/auth";
import { dataWithError, redirectWithSuccess } from "#/.server/toast";
import { report_error } from "#/errors/report";
import { is_reversed } from "@/donations";
import { resp } from "@/helpers/https";
import { send_email_or_throw } from "$/email";
import { stripe } from "$/kit/stripe";
import { donation_refund_started } from "$/pg/queries/dist";
import { donation_get } from "$/pg/queries/donation";
import { user_get } from "$/pg/queries/user";
import {
  build_receipt,
  NpoNotFoundError,
  ReceiptNotReadyError,
} from "$/receipt";
import type { Route } from "./+types/route";
import { type FV, schema } from "./schema";

export interface KycLoaderData {
  first_name: string;
  last_name: string;
  email: string;
}

export const loader = async ({ params, context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);

  const [don, db_user] = await Promise.all([
    donation_get(params.id),
    user_get(user.email),
  ]);
  if (!don) return resp.status(404);

  if (don.from_email.toLowerCase() !== user.email.toLowerCase()) {
    return resp.status(403);
  }

  return {
    first_name: db_user?.first_name ?? "",
    last_name: db_user?.last_name ?? "",
    email: user.email,
  } satisfies KycLoaderData;
};

export const action = async ({
  request,
  params,
  context,
}: Route.ActionArgs) => {
  const user = context.get(user_ctx);

  const fv = await getValidatedFormData<FV>(request, valibotResolver(schema));
  if (fv.errors) return fv;

  const don = await donation_get(params.id);
  if (!don) return resp.status(404);

  if (don.from_email.toLowerCase() !== user.email.toLowerCase()) {
    return resp.status(403);
  }

  if (is_reversed(don.status)) {
    return dataWithError(
      null,
      "This donation was refunded, so it has no tax receipt to send."
    );
  }

  // a partial stripe refund writes nothing to the donation or its dists, so
  // only the charge knows the full amount no longer stands
  if (don.via.startsWith("stripe") && don.settlement) {
    const refunded = await charge_refunded(don.settlement.id).catch((e) => {
      report_error(e, { donation_id: don.id, during: "resend refund check" });
      return null;
    });
    if (refunded === null) {
      return dataWithError(
        null,
        "We couldn't check this donation's refund status. Please try again."
      );
    }
    if (refunded) {
      return dataWithError(
        null,
        "This donation was partly refunded, so we can't resend its original receipt. Contact support for an updated one."
      );
    }
  }

  // a refund run whose dist reversals didn't all complete leaves the donation
  // settled
  if (await donation_refund_started(don.id)) {
    return dataWithError(
      null,
      "This donation is being refunded, so it has no tax receipt to send."
    );
  }

  const addr = [
    fv.data.address.street,
    fv.data.address.complement,
    fv.data.city,
    fv.data.state,
    fv.data.us_state,
    fv.data.country,
    fv.data.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  const donor: IDonor = {
    full_name: `${fv.data.name.first} ${fv.data.name.last}`,
    first_name: fv.data.name.first,
    address: addr,
  };

  const data = await build_receipt(don, donor).catch((e) => {
    if (e instanceof NpoNotFoundError || e instanceof ReceiptNotReadyError) {
      return e;
    }
    throw e;
  });
  if (data instanceof NpoNotFoundError) return resp.status(404);
  if (data instanceof ReceiptNotReadyError) {
    return dataWithError(
      null,
      "This donation is still being distributed. Please try again in a few minutes."
    );
  }
  const { node, subject } = dr.template(data);
  // `send_email` reports a refusal, but a render error throws before it
  const sent = await send_email_or_throw({
    node,
    subject,
    to: [don.from_email],
  }).catch((e) => {
    report_error(e, { donation_id: don.id, during: "receipt resend" });
    return null;
  });
  if (!sent) {
    return dataWithError(
      null,
      "We couldn't send your receipt. Please try again."
    );
  }

  return redirectWithSuccess("..", "Receipt sent");
};

/** any part of the charge behind this intent given back */
async function charge_refunded(intent_id: string): Promise<boolean> {
  const { latest_charge: lc } = await stripe.paymentIntents.retrieve(
    intent_id,
    { expand: ["latest_charge"] }
  );
  if (typeof lc === "string") throw new Error(`charge not expanded: ${lc}`);
  return (lc?.amount_refunded ?? 0) > 0;
}
