import { valibotResolver } from "@hookform/resolvers/valibot";
import {
  donation_match_filed_notif as dmfn,
  donation_private_message as dpm,
  donation_tribute_notif as dtn,
} from "emails";
import { href } from "react-router";
import { getValidatedFormData } from "remix-hook-form";
import { get_session, to_auth } from "#/.server/auth";
import {
  donations_cookie,
  type IDonationIntentExpiries,
} from "#/.server/cookie";
import { dataWithSuccess } from "#/.server/toast";
import { emails as bg_emails } from "@/constants/common";
import { is_paid } from "@/donations/helpers";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import { resp } from "@/helpers/https";
import { from_full } from "@/helpers/name";
import { is_gift_returned } from "@/match";
import { msg } from "@/queue";
import { send_email } from "$/email";
import { enqueue } from "$/kit/queue";
import { db } from "$/pg/db";
import { donation_get, donation_update } from "$/pg/queries/donation";
import { donation_message_put } from "$/pg/queries/donation-message";
import {
  claim_submitted,
  match_event_get,
  open_match_event,
} from "$/pg/queries/match";
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

  // keyed off the row's own id, not `params.id` — `donation_get` also resolves
  // legacy v1 ids, and the event's foreign key points at the former.
  const match = await match_event_get(don.id);

  return {
    ...don,
    donate_url,
    donate_thanks_url,
    profile_url,
    // the donor said so; nothing else could tell us. additive field — an older
    // bundle that doesn't read it is unaffected.
    match_filed: !!match?.submitted_at,
    // one flag, decided in one place: a refund can reach this screen either as
    // a voided event or as a donation that never had one.
    match_voided: is_gift_returned(don.status, match?.voided_at),
  };
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
  // employer capture is not recipient-shaped — a fund donation reaches the same
  // nonprofits and is just as matchable, so it and the filing claim that
  // follows it are allowed here alongside the public message.
  if (
    don.to_type === "fund" &&
    p.type !== "public_msg" &&
    p.type !== "employer" &&
    p.type !== "filed"
  ) {
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
  if (p.type === "employer" && !don.from_company_name) {
    // per-donation, like every other field on this screen — there is no donor
    // entity to hang an employer off, so a later donation asks again.
    await donation_update(db, don.id, { from_company_name: p.company_name });

    // unpaid donations enqueue nothing: settlement reads the name we just wrote
    // and emits the same message itself, so a pack for a gift that never
    // completed is impossible rather than merely unlikely. the two paths share
    // a dedupe key, so a donor who arrives here after settling gets one pack.
    // a refunded donation is not paid either, so it takes the same silent
    // branch — nothing is queued for a gift that went back.
    if (is_paid(don.status)) {
      await enqueue(
        msg("don-match", { id: don.id, from_company_name: p.company_name })
      );
      return dataWithSuccess(
        null,
        "Thanks! We're emailing you what to file with them."
      );
    }
    return dataWithSuccess(
      null,
      "Thanks! We've noted your employer on this donation."
    );
  }
  if (p.type === "filed") {
    // the panel this button lives on is universal, so a donor who never named
    // an employer has no event row yet — nothing opened one for them. same
    // open-then-claim as the pack handler, and for the same reason: the insert
    // is idempotent, so arriving here twice cannot produce two events.
    await open_match_event(don.id);
    const claimed = await claim_submitted(don.id);

    // lost the claim: already filed. a refresh or a double-click, not a
    // failure — and the heads-up must not go out a second time, so it is
    // inside the gate rather than after it.
    if (claimed) {
      const data: dmfn.IData = {
        id: don.id,
        date: to_pretty_utc(don.created_at),
        // the base gift, not the tip — the tip is a separate donation to us and
        // is not what an employer matches
        amount: to_amount(
          don.amount.base,
          don.amount.base / don.upusd,
          don.currency
        ),
        to_name: don.to_name,
        from: {
          first_name: from_full(don.from_name).fn || "there",
          full_name: don.from_name || "Anonymous",
        },
        from_email: don.from_email,
        employer_name: don.from_company_name,
      };
      const { node, subject } = dmfn.template(data);
      // to us, never the beneficiary: we are the charity on the receipt, so the
      // employer's verification request lands here and the nonprofit could not
      // answer it.
      const res = await send_email({ node, subject, to: [bg_emails.hi] });
      if (!res.data) console.error("match filed notif NOT sent:", don.id);
    }

    // one copy either way — the donor did the same thing whether or not their
    // click won the claim. promises only our side of it; whether the employer
    // pays out is theirs and we hold nothing about it.
    return dataWithSuccess(
      null,
      "Thanks for letting us know! We'll answer your employer's verification request."
    );
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
