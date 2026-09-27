import { valibotResolver } from "@hookform/resolvers/valibot";
import { donation_receipt as dr, type IDonor } from "emails";
import { getValidatedFormData } from "remix-hook-form";
import { user_ctx } from "#/.server/auth";
import { dataWithError, redirectWithSuccess } from "#/.server/toast";
import { type IDonation, is_reversed } from "@/donations";
import { resp } from "@/helpers/https";
import { send_email } from "$/email";
import { dist_npo_ids_of, donation_refund_started } from "$/pg/queries/dist";
import { donation_get } from "$/pg/queries/donation";
import { user_get } from "$/pg/queries/user";
import { build_receipt } from "$/receipt";
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

  // a partial or unfinalized refund leaves the donation settled
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

  await send_receipt(don, donor);

  return redirectWithSuccess("..", "Receipt sent");
};

/** the gift's one receipt; a fund's lists each member settlement paid, active or not since */
async function send_receipt(d: IDonation, donor: IDonor) {
  const paid = d.to_type === "fund" ? await dist_npo_ids_of(d.id) : [];
  const data = await build_receipt(d, donor, paid);
  const { node, subject } = dr.template(data);
  await send_email({ node, subject, to: [d.from_email] });
}
