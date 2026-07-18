import { valibotResolver } from "@hookform/resolvers/valibot";
import {
  donation_receipt as dr,
  type IDonation as IDon,
  type IDonor,
} from "emails";
import { getValidatedFormData } from "remix-hook-form";
import { user_ctx } from "#/.server/auth";
import { redirectWithSuccess } from "#/.server/toast";
import type { IDonation } from "@/donations";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { resp } from "@/helpers/https";
import { send_email } from "$/email";
import { app } from "$/env";
import { donation_get } from "$/pg/queries/donation";
import { npo_get, npos_batch_get } from "$/pg/queries/npo";
import { user_get } from "$/pg/queries/user";
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

  await send_receipts(don, donor);

  return redirectWithSuccess("..", "Receipt sent");
};

/** send one receipt per npo dist + tip, mirroring on-don-success-donor/send-receipt.ts */
async function send_receipts(d: IDonation, donor: IDonor) {
  const { base, tip } = d.amount;
  const receipt_id = d.via.startsWith("chariot")
    ? undefined
    : crypto.randomUUID();

  // tip receipt (donation to Better Giving)
  if (tip > 0) {
    const don: IDon = {
      id: d.id,
      date: to_pretty_utc(d.created_at),
      amount: to_amount(tip, tip / d.upusd, d.currency),
      to_name: "Better Giving",
    };
    const data: dr.IData = {
      ...don,
      tax_receipt_id: receipt_id,
      from: donor,
    };
    const { node, subject } = dr.template(data);
    await send_email({ node, subject, to: [d.from_email] });
  }

  // fund: one receipt per member npo
  if (d.to_type === "fund") {
    const n = d.to_members.length;
    const amt = to_amount(base / n, base / n / d.upusd, d.currency);
    const npos = await npos_batch_get(d.to_members.map((x) => +x));
    for (const npo of npos) {
      const don: IDon = {
        id: d.id,
        date: to_pretty_utc(d.created_at),
        amount: amt,
        to_name: npo.name,
      };
      const data: dr.IData = {
        ...don,
        is_bg: npo.id === +app.npo_id,
        tax_receipt_id: receipt_id,
        to_msg_to_from: npo.receipt_msg ?? undefined,
        from: donor,
      };
      const { node, subject } = dr.template(data);
      await send_email({ node, subject, to: [d.from_email] });
    }
    return;
  }

  // direct npo donation
  d.to_type satisfies "npo";
  const npo = await npo_get(+d.to_id);
  if (!npo) throw resp.status(404, `NPO not found: ${d.to_id}`);

  const don: IDon = {
    id: d.id,
    date: to_pretty_utc(d.created_at),
    amount: to_amount(base, base / d.upusd, d.currency),
    to_name: d.to_name,
    program_name: d.program?.name,
  };
  const data: dr.IData = {
    ...don,
    from: donor,
    is_bg: npo.id === +app.npo_id,
    tax_receipt_id: receipt_id,
    to_msg_to_from: npo.receipt_msg ?? undefined,
  };
  const { node, subject } = dr.template(data);
  await send_email({ node, subject, to: [d.from_email] });
}
