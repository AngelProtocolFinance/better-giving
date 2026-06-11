import { donation_nonprofit_notif } from "@better-giving/react-emails";
import { getWeek } from "date-fns";
import { emails } from "@/constants/common";
import { via_name } from "@/donations/helpers";
import { report_error } from "@/errors/report";
import { to_amount } from "@/helpers/email";
import type { Payload as DonDistPayload } from "@/queue/msgs/don-dist";
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

// country metrics — replaces don-settled-country-metrics.ts DDB TransactWrite
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

export async function handle_don_dist(db: DbOrTx, r: DonDistPayload) {
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
    date: r.sttl_date,
    to_id: r.to_id.toString(),
    to_name: r.to_name,
    amount: to_amount(r.amount, r.amount_usd, r.amount_denom),
    program_name: r.program?.name,
    claimed: r.to_claimed ?? true,
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

async function trigger_webhooks(r: DonDistPayload) {
  const is_recurring = r.frequency ? r.frequency !== "one-time" : false;

  const payload: Payload = {
    id: r.id,
    date: r.date_created,
    recipient_id: r.to_id,
    recipient_name: r.to_name,
    amount: r.amount,
    amount_usd: r.amount_usd,
    currency: "USD",
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

  for (const webhook of hooks) {
    const res = await global.fetch(webhook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 410) {
        await delete_webhook(webhook.id, webhook.npo_id).catch(report_error);
        continue;
      }
      const err = await res.text();
      report_error(
        new Error(`webhook ${webhook.url} -> ${res.status}: ${err}`),
        { webhook_url: webhook.url, status: res.status }
      );
      continue;
    }
    console.info("webhook notified", await res.text());
  }
}
