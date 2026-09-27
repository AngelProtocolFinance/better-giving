import { getWeek } from "date-fns";
import { donation_nonprofit_notif } from "emails";
import { report_error } from "#/errors/report";
import { emails } from "@/constants/common";
import { via_name } from "@/donations/helpers";
import { to_pretty_utc } from "@/helpers/date";
import { to_amount } from "@/helpers/email";
import type { IDonDistPayload } from "@/queue";
import type { TFrequency } from "@/schemas";
import { send_email } from "$/email";
import {
  country_metrics_time_get,
  country_time_update,
  country_update,
} from "$/pg/queries/country";
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

export async function handle_don_dist(db: DbOrTx, r: IDonDistPayload) {
  await update_country_metrics(db, {
    npo: r.to_id,
    date: r.sttl_date,
    inc_amount: r.net,
  }).catch(report_error);

  await trigger_webhooks(r).catch(report_error);

  // npo notification email
  const admin_emails = await npo_admins(r.to_id)
    .then((x) => x.map((u) => u.email))
    .catch((err) => {
      report_error(err, { to_id: r.to_id });
      return [] as string[];
    });

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

  // the swallowing send, and an at-most-once kind behind it: the country metric
  // above is an ungated `total + inc` and the webhooks are already delivered by
  // the time this runs, so a redelivery double-counts the donation and re-fires
  // every subscriber's endpoint. a refusal is still reported by the send itself,
  // which is what makes a notification lost here survivable.
  const res = await send_email({
    node,
    subject,
    ...(admin_emails.length === 0
      ? { to: [emails.hi] }
      : { to: admin_emails, bcc: [emails.hi] }),
  });
  console.info("sent npo notif", res);
}

// -- webhooks --

interface Payload {
  id: string;
  date: string;
  recipient_id: number;
  recipient_name: string;
  amount: number;
  amount_usd: number;
  currency: string;
  donor_name: string;
  donor_email: string;
  donor_company?: string;
  program_id?: string;
  program_name?: string;
  payment_method: string;
  frequency: TFrequency;
  is_recurring: boolean;
  form_id: string | undefined;
  form_tag: string | undefined;
}

async function trigger_webhooks(r: IDonDistPayload) {
  const is_recurring = r.frequency ? r.frequency !== "one-time" : false;

  const payload: Payload = {
    id: r.id,
    date: r.date_created,
    recipient_id: r.to_id,
    recipient_name: r.to_name,
    amount: r.amount,
    amount_usd: r.amount_usd,
    currency: r.amount_denom,
    donor_name: r.from?.name || "Anonymous",
    donor_email: r.from_email,
    program_id: r.program?.id,
    program_name: r.program?.name,
    payment_method: via_name(r.via),
    frequency: r.frequency,
    is_recurring,
    form_id: r.form?.id,
    form_tag: r.form?.tag,
  };

  if (r.from?.company) payload.donor_company = r.from.company;

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

// bounds each hook's post and its response read
const WEBHOOK_TIMEOUT_MS = 10_000;
// third-party body: an error page can be large or echo the request path
const REPORTED_BODY_CHARS = 200;

type Webhook = Awaited<ReturnType<typeof query_webhooks>>[number];

// an unread body pins its connection until the timeout; an errored one has
// nothing left to release, and its cancel rejects with the stored error
async function discard_body(res: Response) {
  await res.body?.cancel().catch(() => {});
}

async function read_body_prefix(res: Response, max_chars: number) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < max_chars) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    // cut off mid-body (timeout, reset): the status still gets reported
  } finally {
    await reader.cancel().catch(() => {});
  }
  return text.slice(0, max_chars);
}

async function post_webhook(webhook: Webhook, body: string) {
  const res = await global.fetch(webhook.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });

  // zapier answers 410 once the zap is off or deleted: stop sending, not an error
  if (res.status === 410) {
    await discard_body(res);
    await delete_webhook(webhook.id, webhook.npo_id);
    return;
  }

  if (!res.ok) {
    const err = await read_body_prefix(res, REPORTED_BODY_CHARS);
    // the hook url is a capability url: reports name the row, never the url
    report_error(new Error(`webhook ${webhook.id} -> ${res.status}: ${err}`), {
      webhook_id: webhook.id,
      npo_id: webhook.npo_id,
      status: res.status,
    });
    return;
  }
  await discard_body(res);
  console.info("webhook notified", webhook.id, res.status);
}
