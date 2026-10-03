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
import { base_url } from "$/env";
import {
  country_metrics_time_get,
  country_time_update,
  country_update,
} from "$/pg/queries/country";
import {
  claim_dist_notice,
  count_dist_metric,
  mark_dist_hooks_sent,
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

/**
 * the npo's notice of its share of a donation, three steps under the dist's
 * notice lease: its mail, the country metric, its zapier hooks. each step has
 * its own stamp and a holder runs only the ones still unstamped, so a step
 * that failed is retried alone. the metric's stamp commits with its write, so
 * it counts exactly once; the mail and the hooks can't be taken back, so they
 * repeat only when their stamp can't be written after they went.
 */
export async function handle_don_dist(db: DbOrTx, r: IDonDistPayload) {
  const claim = await claim_dist_notice(r.id, db);
  // every step is stamped, or the dist was refunded since it was queued
  if (claim.status === "done") return;
  if (claim.status === "busy") {
    // the holder may still die unfinished, so the message must come back:
    // any non-2xx is a qstash retry. a 4xx stays out of the incident list.
    report_degraded(new Error(`dist ${r.id} notice busy`), { dist_id: r.id });
    throw new Response("dist notice busy", { status: 409 });
  }

  // a step that fails before anything irreversible went gives the claim back,
  // so the redelivery retries it at once; the steps already stamped stay put
  const or_release = async (step: () => Promise<unknown>) => {
    try {
      await step();
    } catch (e) {
      // the step's error is the one that has to survive. a failed release
      // leaves the claim held, and redeliveries answer busy until its lease
      // runs out.
      await release_dist_notice(r.id, claim.stamp, db).catch((re) =>
        report_error(re, { dist_id: r.id, during: "dist notice release" })
      );
      throw e;
    }
  };

  if (!claim.mailed) {
    await or_release(() => send_npo_notice(r));
    // the mail went: an unstamped run throws with the claim still held, so
    // its redeliveries answer busy until the lease runs out, then mail again
    await stamp_or_throw(r.id, "notice mailed", () =>
      mark_dist_notice_sent(r.id, db)
    );
  }

  if (!claim.counted) await or_release(() => count_country_metric(db, r));

  if (!claim.hooked) {
    // only the hook lookup throws: each hook's own failure is reported by its
    // id and not retried, since a retry reposts every hook that answered
    await or_release(() => trigger_webhooks(r));
    // the hooks went: as with the mail, an unstamped run keeps the claim, and
    // the redelivery after the lease posts them again
    await stamp_or_throw(r.id, "hooks posted", () =>
      mark_dist_hooks_sent(r.id, db)
    );
  }
}

/** the country metric's increment, written in one transaction with its stamp */
async function count_country_metric(db: DbOrTx, r: IDonDistPayload) {
  const npo = await npo_get(r.to_id);
  const week_num_current = npo?.hq_country
    ? await country_metrics_time_get()
    : undefined;

  // nothing to count still stamps the step, so no redelivery looks again
  if (!npo?.hq_country || week_num_current == null) {
    await count_dist_metric(r.id, async () => {}, db);
    return;
  }

  const country_name = npo.hq_country;
  const country_key = country_name.trim().toLowerCase().replace(/ /g, "_");
  const week_num = YYWW(r.sttl_date);
  const is_new_week = week_num > week_num_current;

  const counted = await count_dist_metric(
    r.id,
    async (tx) => {
      await country_update(tx, {
        country_key,
        country_name,
        inc_amount: r.net,
        is_new_week,
      });
      if (is_new_week) await country_time_update(tx, week_num);
    },
    db
  );
  if (counted) console.info(`${r.to_id}:${country_key} +${r.net}`);
}

// waits before the 2nd and 3rd attempt
const STAMP_BACKOFF_MS = [200, 1_000];

/**
 * a stamp written after its step went is retried inline: it is one idempotent
 * update, and every failed delivery from here repeats the step. if every
 * attempt fails it is reported at error level and thrown, with the claim
 * still held.
 */
async function stamp_or_throw(
  dist_id: string,
  step: string,
  stamp: () => Promise<void>
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await stamp();
    } catch (e) {
      const backoff = STAMP_BACKOFF_MS[attempt];
      if (backoff == null) {
        const err = new Error(
          `dist ${dist_id} ${step} but unstamped after ${attempt + 1} attempts`,
          { cause: e }
        );
        report_error(err, { dist_id });
        throw err;
      }
      await new Promise((ok) => setTimeout(ok, backoff));
    }
  }
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
    base_url,
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
