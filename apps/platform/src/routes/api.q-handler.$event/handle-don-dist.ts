import { getWeek } from "date-fns";
import { donation_nonprofit_notif } from "emails";
import { report_degraded, report_error } from "#/errors/report";
import { emails } from "@/constants/common";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import type { IDonDistPayload } from "@/queue";
import { is_zapier_hook_url } from "@/zapier/hook-url";
import { new_donation_item } from "@/zapier/new-donation";
import { send_email_or_throw } from "$/email";
import {
  country_metrics_time_get,
  country_time_update,
  country_update,
} from "$/pg/queries/country";
import {
  claim_dist_notice,
  mark_dist_notice_sent,
  release_dist_notice,
} from "$/pg/queries/dist";
import type { DbOrTx } from "$/pg/queries/helpers";
import { npo_get } from "$/pg/queries/npo";
import { npo_admins } from "$/pg/queries/user";
import { delete_webhook, query_webhooks } from "$/pg/queries/webhook";

function YYWW(iso: string): number {
  const date = new Date(iso);
  const year = String(date.getFullYear()).substring(2);
  const week_num = String(getWeek(date)).padStart(2, "0");
  return +`${year}${week_num}`;
}

// country metrics
async function update_country_metrics(
  db: DbOrTx,
  r: { npo: number; date: string; inc_amount: number }
) {
  const npo = await npo_get(r.npo);
  if (!npo?.hq_country) return;

  const week_num_current = await country_metrics_time_get();
  if (week_num_current == null) return;

  const week_num = YYWW(r.date);
  const is_new_week = week_num > week_num_current;

  const country_key = npo.hq_country.trim().toLowerCase().replace(/ /g, "_");

  await country_update(db, {
    country_key,
    country_name: npo.hq_country,
    inc_amount: r.inc_amount,
    is_new_week,
  });

  if (is_new_week) {
    await country_time_update(db, week_num);
  }

  console.info(`${r.npo}:${country_key} +${r.inc_amount}`);
}

/**
 * the npo's notice of its share of a donation: its mail, the country metric,
 * its zapier hooks — each at most once per dist, under the dist's notice lease.
 */
export async function handle_don_dist(db: DbOrTx, r: IDonDistPayload) {
  const claim = await claim_dist_notice(r.id, db);
  // the notice is out, or the dist was refunded since it was queued
  if (claim.status === "done") return;
  if (claim.status === "busy") {
    // the holder may still die without sending, so the message must come back:
    // any non-2xx is a qstash retry. a 4xx stays out of the incident list.
    report_degraded(new Error(`dist ${r.id} notice busy`), { dist_id: r.id });
    throw new Response("dist notice busy", { status: 409 });
  }

  // the mail is the only step whose failure gives the claim back, so it runs
  // first: the redelivery that takes the claim then repeats nothing that went.
  try {
    await send_npo_notice(r);
  } catch (e) {
    // the refusal is the error that has to survive. a failed release leaves the
    // claim held, and redeliveries answer busy until its lease runs out.
    await release_dist_notice(r.id, claim.stamp, db).catch((re) =>
      report_error(re, { dist_id: r.id, during: "dist notice release" })
    );
    throw e;
  }

  // from here nothing gives the claim back: a release would re-mail the npo,
  // and the metric is an ungated `total + inc`. failures are reported instead.
  await update_country_metrics(db, {
    npo: r.to_id,
    date: r.sttl_date,
    inc_amount: r.net,
  }).catch(report_error);

  // never rejects for a hook: each one's failure is reported by its id
  await trigger_webhooks(r).catch(report_error);

  // reported, not thrown: the work is done, and a throw only buys redeliveries
  // that answer busy until the lease runs out, then take the claim and repeat
  // the mail, the metric and every hook
  await mark_dist_notice_sent(r.id, db).catch((e) =>
    report_error(e, { dist_id: r.id, during: "dist notice sent stamp" })
  );
}

async function send_npo_notice(r: IDonDistPayload) {
  // a failed lookup throws: mailing ops alone would mark the npo's notice sent
  const admin_emails = (await npo_admins(r.to_id)).map((u) => u.email);

  const is_recurring = r.frequency ? r.frequency !== "one-time" : false;

  const data: donation_nonprofit_notif.IData = {
    id: r.id,
    date: to_pretty_utc(r.sttl_date),
    to_id: r.to_id.toString(),
    to_name: r.to_name,
    amount: to_amount(r.amount, r.amount_usd, r.amount_denom),
    program_name: r.program?.name,
    is_recurring,
    from: {
      full_name: r.from?.name || "Anonymous",
      first_name: r.from?.name ? r.from.name.split(" ")[0] : "Anonymous",
      address:
        [
          r.from?.address?.street,
          r.from?.address?.city,
          r.from?.address?.state,
          r.from?.address?.zip,
          r.from?.address?.country,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
    },
  };
  const { node, subject } = donation_nonprofit_notif.template(data);

  const res = await send_email_or_throw({
    node,
    subject,
    ...(admin_emails.length === 0
      ? { to: [emails.hi] }
      : { to: admin_emails, bcc: [emails.hi] }),
  });
  console.info("sent npo notif", res);
}

// -- webhooks --

async function trigger_webhooks(r: IDonDistPayload) {
  const payload = new_donation_item({
    id: r.id,
    date: r.date_created,
    to_id: r.to_id,
    to_name: r.to_name,
    amount: r.amount,
    amount_usd: r.amount_usd,
    currency: r.amount_denom,
    frequency: r.frequency,
    via: r.via,
    from_email: r.from_email,
    from_name: r.from?.name,
    from_company: r.from?.company,
    program_id: r.program?.id,
    program_name: r.program?.name,
    form_id: r.form?.id,
    form_tag: r.form?.tag,
  });

  const hooks = await query_webhooks(r.to_id);
  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    hooks.map((webhook) => post_webhook(webhook, body))
  );
  results.forEach((result, i) => {
    if (result.status === "fulfilled") return;
    const { id, npo_id } = hooks[i]!;
    report_error(result.reason, { webhook_id: id, npo_id });
  });
}

// bounds each hook's post; hooks post concurrently, so one dead url costs every
// other hook nothing
const WEBHOOK_TIMEOUT_MS = 10_000;

type Webhook = Awaited<ReturnType<typeof query_webhooks>>[number];

// an unread body pins its connection until the timeout; an errored one has
// nothing left to release, and its cancel rejects with the stored error
async function discard_body(res: Response) {
  await res.body?.cancel().catch(() => {});
}

async function post_webhook(webhook: Webhook, body: string) {
  // a row stored before subscribe checked its url
  if (!is_zapier_hook_url(webhook.url)) {
    await delete_webhook(webhook.id, webhook.npo_id);
    throw new Error(`webhook ${webhook.id} is not a zapier url: deleted`);
  }

  const res = await global.fetch(webhook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    // a hook answers, it doesn't send us elsewhere: a followed redirect would
    // post the donation to wherever the stored host points it
    redirect: "manual",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  await discard_body(res);

  // zapier answers 410 once the zap is off or deleted: stop sending, not an error
  if (res.status === 410) {
    await delete_webhook(webhook.id, webhook.npo_id);
    return;
  }

  if (!res.ok) {
    // the hook url is a capability url and the body may echo the donor: reports
    // name the row and the status only
    report_error(new Error(`webhook ${webhook.id} -> ${res.status}`), {
      webhook_id: webhook.id,
      npo_id: webhook.npo_id,
      status: res.status,
    });
    return;
  }
  console.info("webhook notified", webhook.id, res.status);
}
