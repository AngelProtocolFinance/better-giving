import {
  donation_private_message as dpm,
  donation_tribute_notif as dtn,
} from "@better-giving/react-emails";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { href } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { get_session, to_auth } from "#/.server/auth";
import {
  donations_cookie,
  type IDonationIntentExpiries,
} from "#/.server/cookie";
import { dataWithSuccess } from "#/.server/toast";
import { is_paid } from "@/donations/helpers";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { resp } from "@/helpers/https";
import { from_full } from "@/helpers/name";
import { send_email } from "$/email";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";
import { donation_message_put } from "$/pg/queries/donation-message";
import { npo_admins } from "$/pg/queries/user";
import type { Route } from "./+types/route";
import { type Schema, schema } from "./schema";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const don = await donation_get(params.id);
  if (!don) throw resp.status(404, "donation not found");

  const base_url = url.origin;
  const donate_thanks_path = href("/donations/:id", { id: params.id });
  const donate_path =
    don.to_type === "fund"
      ? href("/donate-fund/:fund_id", { fund_id: don.to_id })
      : href("/donate/:id", { id: don.to_id });
  const donate_url = `${base_url}${donate_path}`;
  const donate_thanks_url = `${base_url}${donate_thanks_path}`;
  const profile_path =
    don.to_type === "fund"
      ? href("/fundraisers/:fund_id", { fund_id: don.to_id })
      : href("/marketplace/:id", { id: don.to_id });
  const profile_url = `${base_url}${profile_path}`;

  return { ...don, donate_url, donate_thanks_url, profile_url };
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const fv = await getValidatedFormData<Schema>(
    request,
    valibotResolver(schema)
  );
  if (fv.errors) return fv;

  const { data: p } = fv;

  const don = await donation_get(params.id);
  if (!don) throw resp.status(404, "donation not found");
  if (don.to_type === "fund" && p.type !== "public_msg") {
    throw resp.status(
      400,
      "cannot add tribute or private messages to fund donations"
    );
  }

  // prioritize cookie authentication over user authentication
  const expiry_per_intent = await donations_cookie
    .parse(request.headers.get("cookie"))
    .then<IDonationIntentExpiries>((x) => x || {});

  if (
    expiry_per_intent?.[params.id] &&
    expiry_per_intent[params.id] >= Date.now()
  ) {
    // cookie is valid, proceed without further auth checks
  } else {
    // fall back to user authentication
    const { user } = await get_session(request);
    if (!user) return to_auth(request);
    if (user.email !== don.from_email) {
      throw resp.status(403, "not authorized");
    }
  }

  if (p.type === "tribute" && !don.tribute) {
    await donation_update(db, don.id, { tribute: p });

    const amount_usd = don.amount.base / don.upusd;

    //send only if paid
    if (p.notif && is_paid(don.status)) {
      const data: dtn.IData = {
        to_name: don.to_name,
        in_honor_of: p.full_name,
        notif_to_full_name: p.notif.to_fullname,
        from: {
          first_name: from_full(don.from_name).fn ?? "Anonymous",
          full_name: don.from_name ?? "Anonymous",
        },
        from_msg: p.notif.from_msg,
        amount: to_amount(don.amount.base, amount_usd, don.currency),
      };
      const { node, subject } = dtn.template(data);

      await send_email({ node, to: [p.notif.to_email], subject });
    }
    return dataWithSuccess(null, "Tribute added to donation.");
  }

  if (p.type === "public_msg" && !don.from_public_msg_to_npo) {
    if (!is_paid(don.status)) {
      // only write to holding record, don't send email yet - it will be
      await donation_update(db, don.id, {
        from_public_msg_to_npo: p.msg,
        from_public: true,
      });
      return dataWithSuccess(null, "Your message is posted!");
    }

    await db.transaction(async (tx) => {
      await donation_update(tx, don.id, {
        from_public_msg_to_npo: p.msg,
        from_public: true,
      });
      await donation_message_put(tx, {
        id: don.id,
        date: new Date().toISOString(),
        amount: don.amount.base,
        donation_id: don.id,
        donor_message: p.msg,
        donor_name: don.from_name || "Anonymous",
        npo_id: don.to_id,
      });
    });
    return dataWithSuccess(null, "Your message is posted.");
  }
  if (
    p.type === "private_msg" &&
    // hasn't sent one yet
    !don.from_private_msg_to_npo
  ) {
    await donation_update(db, don.id, { from_private_msg_to_npo: p.msg });

    if (!is_paid(don.status)) {
      return dataWithSuccess(null, "Your private message is sent.");
    }

    // send email to npo admins
    const adms = await npo_admins(+don.to_id);

    const data: dpm.IData = {
      id: don.id,
      amount: to_amount(
        don.amount.base,
        don.amount.base / don.upusd,
        don.currency
      ),
      date: to_pretty_utc(don.created_at),
      to_name: don.to_name,
      from: {
        first_name: from_full(don.from_name).fn || "Anonymous",
        full_name: don.from_name || "Anonymous",
      },
      message: p.msg,
    };
    const { node, subject } = dpm.template(data);

    const res = await send_email({
      node,
      subject,
      to: adms.map((a) => a.email),
    });

    console.info(res);
    return dataWithSuccess(null, "Your private message is sent.");
  }
};
