import crypto from "node:crypto";
import { crc32 } from "node:zlib";
import {
  type Capture,
  type Order,
  PayPalApiError,
  type Sale,
  type Subs,
  type WebhookEvent,
} from "@better-giving/paypal";
import { report_degraded, report_error, report_resp } from "#/errors/report";
import {
  calc_donation_settle,
  type IDonation,
  type IDonationSettled,
  type IDonationUpdate,
  is_reversed,
  settle_msgs,
} from "@/donations";
import { paypal_donor_update } from "@/donations/helpers";
import { PLACEHOLDER_EMAIL } from "@/donations/schema";
import { msg } from "@/queue";
import type { ISub, TInterval, TStatus } from "@/subscriptions";
import { paypal as paypal_env, stage } from "$/env";
import { fiat_monitor } from "$/kit/discord";
import { paypal } from "$/kit/paypal";
import { enqueue, schedule } from "$/kit/queue";
import { db } from "$/pg/db";
import { dists_for_refund } from "$/pg/queries/dist";
import {
  donation_by_sttl_id,
  donation_get,
  donation_put,
  donation_settle_state_locked,
  donation_update,
  settlement_exists,
} from "$/pg/queries/donation";
import { sub_get, sub_put, sub_update } from "$/pg/queries/subscription";
import { process_refund } from "$/refund/process";
import type { Route } from "./+types/route";

type TIntervalFrom = "DAY" | "WEEK" | "MONTH" | "YEAR";
const to_interval = (from: TIntervalFrom): TInterval => {
  switch (from) {
    case "DAY":
      return "day";
    case "WEEK":
      return "week";
    case "MONTH":
      return "month";
    case "YEAR":
      return "year";
  }
};

// builds an ISub from a paypal subscription resource + donation context, at
// the subscription's own status. returns a string naming what the subscription
// or its plan lacks, else the record; a plan lookup paypal refuses for good is
// `{ refused }`. both callers acknowledge either: ACTIVATED passes its event
// payload, which a redelivery repeats, and SALE passes the live subscription
// once it is past approval.
async function build_sub_record(args: {
  subs_id: string;
  sub: Subs;
  don: IDonation;
  from_email: string;
  create_time?: string;
  update_time?: string;
  /** stands in for next billing on a subscription that has ended or paused,
   * which paypal gives none — the column is not null */
  last_charge_time?: string;
}): Promise<ISub | string | { refused: number }> {
  const { subs_id, sub, don, from_email } = args;
  const create_time =
    args.create_time ?? sub.create_time ?? new Date().toISOString();
  const update_time =
    args.update_time ?? sub.update_time ?? new Date().toISOString();

  const plan_id = sub.plan_id;
  if (!plan_id) return "missing subscription plan id";
  const plan = await fetch_resource(() => paypal.get_plan(plan_id));
  if (typeof plan === "number") return { refused: plan };
  // any other non-2xx throws; a 2xx with no body is the fetch's fault, not
  // the payload's, so it throws to a redelivery rather than returning a gap
  if (!plan) throw new Error(`plan not found: ${sub.plan_id}`);
  const cycle = plan.billing_cycles?.[0];
  if (!cycle) return "missing plan billing cycle";
  const interval = cycle.frequency?.interval_unit;
  const interval_count = cycle.frequency?.interval_count || 1;
  if (!interval) return "missing plan frequency interval unit";
  const status = (sub.status && SUB_STATUS[sub.status]) || "active";
  const next_billing =
    sub.billing_info?.next_billing_time ??
    (status === "inactive" ? args.last_charge_time : undefined);
  if (!next_billing) return "missing next billing time";
  if (!plan.product_id) return "missing plan product id";

  const total = don.amount.base + don.amount.tip + don.amount.fee_allowance;
  const total_usd = total / don.upusd;
  return {
    id: subs_id,
    created_at: new Date(create_time).toISOString(),
    updated_at: new Date(update_time).toISOString(),
    interval: to_interval(interval),
    interval_count,
    next_billing: new Date(next_billing).toISOString(),
    amount: total,
    amount_usd: total_usd,
    currency: don.currency,
    product_id: plan.product_id,
    to_npo_id: don.to_type === "npo" ? Number(don.to_id) : null,
    to_fund_id: don.to_type === "fund" ? don.to_id : null,
    to_name: don.to_name,
    platform: "paypal",
    status,
    from_id: from_email,
  };
}

interface IAddress {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_1?: string;
  admin_area_2?: string;
  postal_code?: string;
  country_code: string;
}
interface IName {
  given_name?: string;
  surname?: string;
}

interface ISettlement {
  net: number;
  fee: number;
  c: string;
}

// paypal amounts are decimal strings; as floats 50 − 2.24 − 0.7 is
// 47.059999999999995, so this subtracts in the finest minor unit the operands use
const dec_sub = (from: string, parts: string[]): number => {
  const dp = Math.max(
    ...[from, ...parts].map((v) => v.split(".")[1]?.length ?? 0)
  );
  const k = 10 ** dp;
  const minor = (v: string) => Math.round(+v * k);
  return parts.reduce((acc, v) => acc - minor(v), minor(from)) / k;
};

// paypal hands the three parts separately at every call site — an order's
// payment source, a subscriber, a shipping address — so they are gathered here
// rather than at each of the four
const donor_update = (
  email: string,
  name: IName | undefined,
  address?: IAddress | undefined
): IDonationUpdate =>
  paypal_donor_update({ email_address: email, name, address });

/**
 * the enqueue sits after the commit, so a delivery can leave a settled row
 * whose messages never went out, or only some of them; the delivery whose
 * settle guard fires re-sends them all. a duplicate costs nothing — the dist is
 * absorbed by unique(donation_id, to_id), the match event by its unique
 * donation_id, the receipt by its send claim.
 *
 * a reversed row is the one case that must not be recomputed: the settle path
 * refuses to write over a refund, and re-queuing here would walk around that
 * with a dist and a receipt for money the donor already got back.
 */
const requeue = async (row: IDonation | undefined, order_id: string) => {
  if (!row?.settlement)
    throw new Error("duplicate settle without a settlement");
  if (is_reversed(row.status)) return;
  await enqueue(
    ...settle_msgs(
      { ...row, settlement: row.settlement },
      // the settlement living on the order row means this was the charge that
      // opened the donation; on any other row it is a rebill clone, which is
      // excluded from employer matching.
      { match: row.id === order_id }
    )
  );
};

/** 4xx that heal with no change to the event: a timeout or a rate limit */
const RETRYABLE_4XX = new Set([408, 429]);

/** a 4xx about the resource itself, answered the same way on every retry */
const is_refusal = (e: unknown): e is PayPalApiError =>
  e instanceof PayPalApiError &&
  e.http_status >= 400 &&
  e.http_status < 500 &&
  !RETRYABLE_4XX.has(e.http_status);

/**
 * `requeue` for a sale settled on an earlier delivery. the match flag needs the
 * order id, and only the subscription's custom_id carries it — nothing on the
 * settled row tells the order row from a rebill clone.
 *
 * a failed fetch throws through to a non-2xx: this redelivery is usually the
 * one recovering messages an earlier delivery never sent, and a 200 here would
 * stop paypal retrying with the dist still unsent. a missing subs id or
 * custom_id, or a 4xx on the lookup, is reported and answered 200 instead — no
 * retry can supply either.
 */
const requeue_sale = async (sale_id: string, subs_id: string | undefined) => {
  const sub = subs_id
    ? await paypal.get_subscription(subs_id).catch((e: unknown) => {
        if (!is_refusal(e)) throw e;
        report_error(
          new Error(
            `subscription lookup refused, sale ${sale_id} not requeued`,
            {
              cause: e,
            }
          ),
          { sale_id, subs_id, http_status: e.http_status }
        );
        return "refused" as const;
      })
    : undefined;
  if (sub === "refused") return;
  const order_id = sub?.custom_id;
  if (!order_id) {
    report_error(new Error(`no order id to requeue sale ${sale_id}`), {
      sale_id,
      subs_id,
    });
    return;
  }
  await requeue(await donation_by_sttl_id(sale_id), order_id);
};

// -- signature verification --

// paypal serves webhook certs from the classic `api.` host, not the `api-m.`
// one the rest client calls. an api url off this map leaves no cert host, so
// every delivery is answered 503 until the config is fixed
const CERT_HOST_BY_API_HOST: Record<string, string> = {
  "api-m.paypal.com": "api.paypal.com",
  "api.paypal.com": "api.paypal.com",
  "api-m.sandbox.paypal.com": "api.sandbox.paypal.com",
  "api.sandbox.paypal.com": "api.sandbox.paypal.com",
};
const paypal_api_host =
  paypal_env.api_url && URL.canParse(paypal_env.api_url)
    ? new URL(paypal_env.api_url).host
    : null;
const paypal_cert_host = paypal_api_host
  ? CERT_HOST_BY_API_HOST[paypal_api_host]
  : undefined;

/** the header names the key the signature is checked against, so a url
 * anywhere but paypal's lets the sender sign with a key of their own */
const is_paypal_cert_url = (url: URL) =>
  url.protocol === "https:" &&
  url.host === paypal_cert_host &&
  url.pathname.startsWith("/v1/notifications/certs/") &&
  !url.username &&
  !url.password &&
  !url.search &&
  !url.hash;

// the subject rule paypal's own java sdk applied (SSLUtil.validateCertificateChain):
// messageverificationcerts.paypal.com live, .sandbox.paypal.com in sandbox
const is_paypal_signing_cert = (cert: crypto.X509Certificate) =>
  cert.subject
    .split("\n")
    .some(
      (rdn) =>
        rdn.startsWith("CN=messageverificationcerts") &&
        rdn.endsWith(".paypal.com")
    );

const is_current = (cert: crypto.X509Certificate) => {
  const now = new Date();
  return cert.validFromDate <= now && now <= cert.validToDate;
};

const CERT_FETCH_TIMEOUT_MS = 5_000;

/** paypal's cert host is down or shedding load — a network error, a timeout, a
 * 5xx or a 429 — which heals with no change on either side. a 4xx, a redirect
 * or a 200 that isn't a cert does not, and is a plain Error */
class CertHostUnreachable extends Error {
  override name = "CertHostUnreachable";
}

const cert_cache = new Map<string, crypto.X509Certificate>();
/** throws on anything but paypal's current signing cert, caching only that */
async function download_and_cache_cert(
  cert_url: URL
): Promise<crypto.X509Certificate> {
  const cached = cert_cache.get(cert_url.href);
  if (cached && is_current(cached)) return cached;
  cert_cache.delete(cert_url.href);
  // the network failing or the timeout firing, while connecting or mid-body
  const unreachable = (cause: unknown) => {
    throw new CertHostUnreachable(
      `[paypal webhook] cert host ${cert_url.host} unreachable`,
      { cause }
    );
  };
  // the allowlist vetted this url only; a followed redirect would fetch the key
  // from wherever the hop points. "manual" hands the 3xx back as a status, so
  // the checks below report a redirect as a bug, not as the host being down
  const res = await fetch(cert_url, {
    redirect: "manual",
    signal: AbortSignal.timeout(CERT_FETCH_TIMEOUT_MS),
  }).catch(unreachable);
  // neither the Response nor an error with a `status` prop: the reporters keep
  // a 4xx of either out of sentry, and a 403/404 here drops every event
  const answered = `[paypal webhook] cert host ${cert_url.host} answered ${res.status}`;
  if (res.status >= 500 || res.status === 429)
    throw new CertHostUnreachable(answered);
  if (!res.ok) throw new Error(answered);
  const cert = new crypto.X509Certificate(await res.text().catch(unreachable));
  if (!is_paypal_signing_cert(cert))
    throw new Error("[paypal webhook] cert is not paypal's signing cert");
  if (!is_current(cert))
    throw new Error("[paypal webhook] paypal's signing cert is not current");
  cert_cache.set(cert_url.href, cert);
  return cert;
}

const UNVERIFIED_MAX_CHARS = 128;

/** which delivery a report is about. the signature failed or went unchecked,
 * so every field is the sender's say-so, and only the body's id and type are
 * read */
const delivery_ref = (
  body: string,
  transmission_id: string,
  cert_url: URL | null
) => {
  const ev = ((): { id?: unknown; event_type?: unknown } => {
    try {
      const v: unknown = JSON.parse(body);
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  })();
  // a sender sets each to any length, and each lands in logs and sentry
  const clip = (v: unknown) =>
    typeof v === "string" ? v.slice(0, UNVERIFIED_MAX_CHARS) : null;
  return {
    unverified: {
      transmission_id: clip(transmission_id),
      event_id: clip(ev.id),
      event_type: clip(ev.event_type),
      cert_host: clip(cert_url?.host),
    },
  };
};

type VerifyResult =
  | { error: true; status: number; message: string; body?: undefined }
  | { error: false; body: string; status?: undefined; message?: undefined };

async function verified_body(
  body: string,
  headers: Headers
): Promise<VerifyResult> {
  const transmission_id = headers.get("paypal-transmission-id");
  const timestamp = headers.get("paypal-transmission-time");
  const cert_url_header = headers.get("paypal-cert-url");
  const signature = headers.get("paypal-transmission-sig");

  if (!transmission_id)
    return {
      error: true,
      status: 201,
      message: "missing paypal-transmission-id",
    };
  if (!timestamp)
    return {
      error: true,
      status: 201,
      message: "missing paypal-transmission-time",
    };
  if (!cert_url_header)
    return { error: true, status: 201, message: "missing paypal-cert-url" };
  if (!signature)
    return {
      error: true,
      status: 201,
      message: "missing paypal-transmission-sig",
    };

  const cert_url = URL.canParse(cert_url_header)
    ? new URL(cert_url_header)
    : null;
  const ref = () => delivery_ref(body, transmission_id, cert_url);
  // our config, not the sender's url: a non-2xx holds paypal's genuine
  // deliveries for redelivery once PAYPAL_API_URL is fixed
  if (cert_url && !paypal_cert_host) {
    report_error(new Error("[paypal webhook] cert host is not configured"), {
      api_host: paypal_api_host,
    });
    return { error: true, status: 503, message: "signature unverifiable" };
  }
  if (!cert_url || !is_paypal_cert_url(cert_url)) {
    report_error(new Error("[paypal webhook] cert url is not paypal's"), ref());
    return { error: true, status: 201, message: "invalid signature" };
  }

  try {
    const crc_body = crc32(body);
    const message = [
      transmission_id,
      timestamp,
      paypal_env.webhook_id,
      crc_body,
    ].join("|");

    const cert = await download_and_cache_cert(cert_url);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(message);

    const signature_buffer = Buffer.from(signature, "base64");
    const is_valid = verifier.verify(cert.publicKey, signature_buffer);
    // still a 2xx: no retry makes a forged signature verify. reported because
    // paypal's own events land here too when our webhook id or crc is wrong
    if (!is_valid) {
      report_error(
        new Error("[paypal webhook] signature does not verify"),
        ref()
      );
      return { error: true, status: 201, message: "invalid signature" };
    }

    return { error: false, body };
  } catch (error) {
    // a cert paypal's host failed to serve, or a key this code can't verify
    // with, says nothing about the event; a non-2xx keeps paypal redelivering it
    const report =
      error instanceof CertHostUnreachable ? report_degraded : report_error;
    report(error, ref());
    return { error: true, status: 503, message: "signature unverifiable" };
  }
}

/** paypal's approval states map to nothing: a lifecycle event leaves the row
 * as it is, and a new row is born active */
const SUB_STATUS: Partial<Record<NonNullable<Subs["status"]>, TStatus>> = {
  ACTIVE: "active",
  SUSPENDED: "inactive",
  CANCELLED: "inactive",
  EXPIRED: "inactive",
};

const AWAITING_CAPTURE = new Set<IDonation["status"]>(["created", "intent"]);

// a completed charge refunded or reversed since still settles: its refund or
// reversal event finds the settlement and reverses it. a v2 capture has no
// reversed status — a chargeback leaves it as it was
const SETTLEABLE_CAPTURE = new Set<Capture["status"]>([
  "COMPLETED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);
// "reversed" is a live sale state the vendored v1 spec leaves out
const SETTLEABLE_SALE = new Set<string | undefined>([
  "completed",
  "partially_refunded",
  "refunded",
  "reversed",
]);

/** the resource, or the status of a lookup paypal refused for good — a
 * redelivery gets the same answer. anything else throws to a redelivery */
const fetch_resource = async <T>(get: () => Promise<T>): Promise<T | number> =>
  get().catch((e: unknown) => {
    if (is_refusal(e)) return e.http_status;
    throw e;
  });

const money = (value?: string, currency?: string) =>
  value ? `${value} ${currency ?? ""}`.trim() : "unknown";

interface IMoney {
  value?: string;
  currency?: string;
}

/** whether `parts` (refunds or reversals, signed either way) together take all
 * of `whole`. summed in the finest minor unit any uses, as `dec_sub` does */
const is_whole = (parts: IMoney[], whole: IMoney) => {
  if (!whole.value) return false;
  const taken = parts.flatMap((p) =>
    p.value && p.currency === whole.currency ? [p.value.replace(/^-/, "")] : []
  );
  const dp = Math.max(
    ...[...taken, whole.value].map((v) => v.split(".")[1]?.length ?? 0)
  );
  const minor = (v: string) => Math.round(+v * 10 ** dp);
  return taken.reduce((sum, v) => sum + minor(v), 0) >= minor(whole.value);
};

/** what paypal's copy of the order lists as refunded off capture `cid`,
 * leaving out refund `except`. a failed read is reported, never "no earlier
 * refunds", which would pass a chargeback of the rest as partial: undefined
 * when a redelivery may read it, "refused" when paypal refuses it for good */
const prior_refunds = async (
  order_id: string,
  cid: string,
  except: string | undefined
): Promise<IMoney[] | "refused" | undefined> => {
  const order = await paypal.get_order(order_id).catch((e: unknown) => {
    report_error(
      new Error(`[paypal webhook] order lookup failed for capture ${cid}`, {
        cause: e,
      }),
      {
        order_id,
        capture_id: cid,
        http_status: e instanceof PayPalApiError ? e.http_status : undefined,
      }
    );
    return is_refusal(e) ? ("refused" as const) : undefined;
  });
  if (!order || order === "refused") return order;
  const payments = order.purchase_units?.find((u) =>
    u.payments?.captures?.some((c) => c.id === cid)
  )?.payments;
  return (payments?.refunds ?? [])
    .filter((r) => r.status === "COMPLETED" && r.id !== except)
    .map((r) => ({
      value: r.amount?.value,
      currency: r.amount?.currency_code,
    }));
};

const REFUND_ALERT_FROM = "paypal-refund";

/** how much of the charge is now taken back: all of it, less, or unknown
 * because what earlier refunds took can't be read */
type TExtent = "full" | "partial" | "unsized";

const NOT_REVERSED_NOTICE: Record<
  Exclude<TExtent, "full">,
  { title: string; action: string }
> = {
  partial: {
    title: "Partial Refund Not Reversed",
    action:
      "nothing was reversed automatically. ops must settle the rest by hand.",
  },
  unsized: {
    title: "Reversal Not Sized",
    action:
      "paypal refused the lookup of earlier refunds, so this reversal could not be sized against the charge. nothing was reversed automatically. ops must settle it by hand.",
  },
};

interface IReversal {
  sttl_id: string;
  extent: TExtent;
  status: string | undefined;
  refunded: string;
  charged: string;
  /** what a not-reversed notice adds about how the extent was judged */
  caveat?: string;
  /** the donation paypal's copy of the charge names, for a charge not settled here */
  owner: () => Promise<string | undefined>;
}

/**
 * reverses the donation a capture or sale settled, once it is refunded or
 * reversed in full. process_refund reverses every dist in full, so a partial
 * refund is ops' to settle by hand: they get a notice and nothing is
 * reversed. the refund that completes the charge reverses it all.
 */
const reverse_settled = async (ev: WebhookEvent, c: IReversal) => {
  const don = await donation_by_sttl_id(c.sttl_id);
  if (!don) {
    const owner_id = await c.owner();
    const owner = owner_id ? await donation_get(owner_id) : undefined;
    // the settle event is still on its way: paypal guarantees no ordering
    if (owner)
      return new Response(`nothing settled for ${c.sttl_id} yet`, {
        status: 503,
      });
    // a charge of another integration on the account, or one whose settle was
    // acknowledged unroutable: no redelivery gives it a donation
    report_error(new Error("[paypal webhook] refund of a charge not ours"), {
      event_id: ev.id,
      sttl_id: c.sttl_id,
    });
    return new Response(`no donation for ${c.sttl_id}`, { status: 200 });
  }
  if (is_reversed(don.status))
    return new Response(`donation is ${don.status}`, { status: 200 });

  const detail = `donation ${don.id}, charge ${c.sttl_id}, event ${ev.id}`;
  if (c.extent !== "full") {
    const notice = NOT_REVERSED_NOTICE[c.extent];
    const alert = {
      type: "NOTICE" as const,
      from: `${REFUND_ALERT_FROM}-${stage}`,
      title: notice.title,
      body: [
        detail,
        `refunded in this event: ${c.refunded}, of a charge of ${c.charged} (paypal status ${c.status})`,
        ...(c.caveat ? [c.caveat] : []),
        notice.action,
      ].join("\n"),
    };
    // keyed on the event, so a duplicate delivery posts one notice
    await enqueue(
      msg("fiat-notice", { id: `paypal-${c.extent}_${ev.id}`, alert })
    );
    return new Response(`${c.extent} reversal reported`, { status: 200 });
  }

  const graphs = await dists_for_refund(don.id);
  // the dist lands on the queue after the settle; a redelivery finds it
  if (graphs.length === 0)
    throw new Error(`no settled dists for donation: ${don.id}`);
  const result = await process_refund(don.id, graphs, {
    form_id: don.form_id ?? null,
    program_id: don.program?.id ?? null,
    alert_from: REFUND_ALERT_FROM,
  });
  console.info(
    `[paypal webhook] ${detail} refunded, dists: ${graphs.length}, failures: ${result.failures.length}, losses: ${result.loss_msgs.length}`
  );
  // process_refund skips what it already reversed and retries what failed,
  // so a redelivery finishes the job
  if (result.failures.length > 0)
    return new Response("reversal incomplete", { status: 503 });
  return new Response("donation reversed", { status: 200 });
};

// -- route action --

/**
 * paypal redelivers any non-2xx up to 25 times over 3 days, always with the
 * same payload — so a delivery missing what the route needs is reported and
 * acknowledged. anything a later attempt could fix keeps its non-2xx.
 */
const unroutable = (ev: WebhookEvent, reason: string) => {
  report_error(new Error(`[paypal webhook] unroutable: ${reason}`), {
    event_id: ev.id,
    event_type: ev.event_type,
    resource_id: ev.resource?.id,
  });
  return new Response(`not routable: ${reason}`, { status: 200 });
};

export async function action({ request }: Route.ActionArgs) {
  try {
    const body = await request.text();
    const result = await verified_body(body, request.headers);
    if (result.error)
      return new Response(result.message, { status: result.status });

    const ev: WebhookEvent = JSON.parse(result.body);

    console.info(
      `[paypal webhook] received: ${ev.event_type} ${ev.id} resource ${ev.resource?.id}`
    );

    switch (ev.event_type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED": {
        const {
          id: subs_id,
          subscriber,
          custom_id: don_id,
          create_time = new Date().toISOString(),
          update_time = new Date().toISOString(),
        } = ev.resource as Subs;

        if (!don_id) return unroutable(ev, "missing don id");
        const don = await donation_get(don_id);
        if (!don) return new Response("don record not found", { status: 500 });

        //create subs record
        if (!subscriber?.email_address)
          return unroutable(ev, "missing subscriber email");

        const donor = donor_update(
          subscriber.email_address,
          subscriber.name,
          subscriber.shipping_address?.address
        );

        // update the donation with donor info
        const updated_don = await donation_update(db, don_id, donor);
        console.info(`don donor info updated: ${updated_don.id}`);

        if (!subs_id) return unroutable(ev, "missing subscription id");

        const subs_db = await build_sub_record({
          subs_id,
          sub: ev.resource as Subs,
          don,
          from_email: updated_don.from_email,
          create_time,
          update_time,
        });
        if (typeof subs_db === "string") return unroutable(ev, subs_db);
        if ("refused" in subs_db)
          return unroutable(ev, `paypal answered ${subs_db.refused} for plan`);

        await sub_put(db, subs_db);
        return new Response(`created subscription record ${subs_id}`, {
          status: 200,
        });
      }
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.SUSPENDED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
      case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        const subs_id = (ev.resource as Subs).id;
        if (!subs_id) return unroutable(ev, "missing subscription id");
        // read from paypal, not the event: lifecycle events arrive in no order
        const sub = await fetch_resource(() =>
          paypal.get_subscription(subs_id)
        );
        if (typeof sub === "number")
          return unroutable(
            ev,
            `paypal answered ${sub} for subscription ${subs_id}`
          );

        const status = sub.status ? SUB_STATUS[sub.status] : undefined;
        const next_billing = sub.billing_info?.next_billing_time;
        // ended or paused at paypal already, so no sub-deactivated: that
        // message cancels at the provider
        const { row } = await sub_update(db, subs_id, {
          ...(status && { status }),
          ...(next_billing && {
            next_billing: new Date(next_billing).toISOString(),
          }),
        });
        // the activation that creates the row is still on its way
        if (!row)
          return new Response(`no subscription record ${subs_id} yet`, {
            status: 503,
          });
        return new Response(`subscription ${subs_id} is ${row.status}`, {
          status: 200,
        });
      }
      case "CHECKOUT.ORDER.APPROVED": {
        const {
          id: order_id,
          payment_source,
          purchase_units,
        } = ev.resource as Order;

        if (!order_id) return unroutable(ev, "missing order id");
        const don_id = purchase_units?.[0]?.custom_id;
        if (!don_id)
          return unroutable(ev, `missing onhold id for order: ${order_id}`);

        const ps = payment_source?.venmo || payment_source?.paypal;
        // written before the capture, so its completed event finds the payer
        if (ps?.email_address)
          await donation_update(
            db,
            don_id,
            donor_update(ps.email_address, ps.name, ps.address)
          );

        // not captured here: this event lands as the browser's own capture
        // runs, under the same request id. a check held past it captures
        // only an order still APPROVED
        await schedule(
          msg("paypal-order-capture", {
            order_id,
            don_id,
            scheduled_at: new Date().toISOString(),
          })
        );

        // a payer left off the approval is not lost: the capture's completed
        // event reads the donor off paypal's copy of the order
        return new Response("capture check scheduled", { status: 200 });
      }
      case "PAYMENT.CAPTURE.COMPLETED": {
        const { id: cid } = ev.resource as Capture;
        if (!cid) return unroutable(ev, "missing capture id");

        // idempotency: already processed this capture. rechecked under the
        // order row's lock below — this one only spares a redelivery the
        // paypal fetches and the settle math.
        if (await settlement_exists(cid)) {
          console.info(
            `[paypal webhook] capture ${cid} already settled, skipping`
          );
          // a capture only ever settles its order's own row
          const row = await donation_by_sttl_id(cid);
          await requeue(row, row?.id ?? "");
          return new Response("already processed", { status: 200 });
        }

        // the donation and the amounts come from paypal's copy: the signature
        // is the only check on the event body
        const capture = await fetch_resource(() => paypal.get_capture(cid));
        // as for a sale: a signed event naming a capture paypal can't find is
        // our lookup gone wrong, and acking it drops the payment
        if (typeof capture === "number") {
          report_error(
            new Error(
              `[paypal webhook] paypal answered ${capture} for capture`
            ),
            { event_id: ev.id, capture_id: cid, http_status: capture }
          );
          return new Response("capture lookup refused", { status: 503 });
        }
        const {
          create_time: create_date = new Date().toISOString(),
          custom_id: don_id,
          seller_receivable_breakdown: b,
          supplementary_data,
          status,
        } = capture;
        if (!don_id)
          return unroutable(ev, `missing onhold id for capture: ${cid}`);
        if (!status || !SETTLEABLE_CAPTURE.has(status))
          return unroutable(ev, `capture ${cid} is ${status}`);

        if (!b?.gross_amount)
          return unroutable(ev, `missing gross amount for capture ${cid}`);

        const platform_fees = b.platform_fees ?? [];
        // a fallback net subtracts these from gross, which only works in one currency
        if (
          !b.net_amount &&
          platform_fees.some(
            (f) => f.amount.currency_code !== b.gross_amount.currency_code
          )
        )
          return unroutable(
            ev,
            `platform fee currency differs from gross for capture ${cid}`
          );

        // only gross_amount is required in the breakdown; fee and net may be absent
        const settled = ((r): ISettlement => {
          const p = b.paypal_fee?.value ?? "0";
          const n =
            b.net_amount?.value ??
            dec_sub(b.gross_amount.value, [
              p,
              ...platform_fees.map((f) => f.amount.value),
            ]);
          const c = b.net_amount?.currency_code ?? b.gross_amount.currency_code;
          if (r) {
            return { net: +n * +r, fee: +p * +r, c };
          }
          return { net: +n, fee: +p, c };
        })(b.exchange_rate?.value);

        // fetch order to get real payer email before settling
        const order_id = supplementary_data?.related_ids?.order_id;
        // an order paypal refuses leaves the donor as the approval wrote it
        const order = order_id
          ? await fetch_resource(() => paypal.get_order(order_id))
          : undefined;
        if (order && typeof order !== "number") {
          const ps =
            order.payment_source?.venmo || order.payment_source?.paypal;
          if (ps?.email_address) {
            const donor = donor_update(ps.email_address, ps.name, ps.address);
            await donation_update(db, don_id, donor);
          }
        }

        // if still placeholder email, retry unless donation is old (>1h)
        const don = await donation_get(don_id);
        if (don && don.from_email === PLACEHOLDER_EMAIL) {
          const age_ms = Date.now() - new Date(don.created_at).getTime();
          if (age_ms < 60 * 60 * 1000) {
            console.warn(
              `[paypal webhook] placeholder email on ${don_id}, requesting retry`
            );
            return new Response("placeholder email, retry later", {
              status: 503,
            });
          }
          report_error(
            new Error(
              `[paypal webhook] settling ${don_id} with placeholder email (timeout)`
            ),
            { don_id }
          );
        }

        const sttl_record = {
          id: cid,
          date: create_date,
          currency: "USD",
          fee: settled.fee,
          net: settled.net,
        };

        const prior = await donation_get(don_id);
        if (!prior)
          return new Response(`donation not found: ${don_id}`, { status: 500 });
        const result = calc_donation_settle({
          kind: "one-time",
          order_id: don_id,
          prior,
          settlement: sttl_record,
        });
        // the refund already reversed this donation; a 2xx so paypal stops
        // redelivering rather than a throw that reads as a broken endpoint.
        if (result.op === "noop")
          return Response.json({ id: don_id }, { status: 200 });
        if (result.op !== "update")
          throw new Error("unexpected put for paypal capture");

        const p = await db.transaction(
          async (
            tx
          ): Promise<
            | { op: "dup"; row: IDonation | undefined }
            | { op: "reversed" }
            | { op: "settled"; row: IDonation }
          > => {
            // the guard above read outside this transaction, so two concurrent
            // deliveries of one capture can both pass it. re-decide under the
            // order row's write lock, where the loser reads what the winner
            // committed.
            const state = await donation_settle_state_locked(
              tx,
              result.order_id
            );
            if (!state) throw new Error(`donation not found: ${don_id}`);
            if (await settlement_exists(cid, tx))
              return { op: "dup", row: await donation_by_sttl_id(cid, tx) };
            // `result.patch` was computed from a read taken before the lock; a
            // refund committed since then must not be written back to settled.
            if (is_reversed(state.status)) return { op: "reversed" };
            return {
              op: "settled",
              row: await donation_update(tx, result.order_id, result.patch),
            };
          }
        );

        if (p.op === "reversed")
          return Response.json({ id: don_id }, { status: 200 });
        if (p.op === "dup") {
          await requeue(p.row, don_id);
          return new Response("already processed", { status: 200 });
        }
        await enqueue(...result.msgs);

        console.info(`donation settled: ${p.row.id}`);
        return Response.json({ id: p.row.id });
      }
      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.REVERSED": {
        // the resource is the refund; the capture it reverses is its `up` link
        const refund = ev.resource as {
          id?: string;
          amount?: { value?: string; currency_code?: string };
          links?: { rel?: string; href?: string }[];
        };
        const up = refund.links?.find((l) => l.rel === "up")?.href;
        const cid = up?.match(/\/v2\/payments\/captures\/([^/?#]+)$/)?.[1];
        if (!cid) return unroutable(ev, "missing refunded capture id");

        const capture = await fetch_resource(() => paypal.get_capture(cid));
        if (typeof capture === "number")
          return unroutable(
            ev,
            `paypal answered ${capture} for capture ${cid}`
          );
        const gross = capture.amount;
        const part = refund.amount;
        const is_reversal = ev.event_type === "PAYMENT.CAPTURE.REVERSED";
        const order_id = capture.supplementary_data?.related_ids?.order_id;
        const taken = { value: part?.value, currency: part?.currency_code };
        const whole = { value: gross?.value, currency: gross?.currency_code };
        // a chargeback may leave the capture's status as it was, and a refund
        // leaves it PARTIALLY_REFUNDED even once a later reversal takes the
        // rest — so a reversal is also full when it and the refunds before it
        // take the whole gross. the order is read only when those can decide
        const extent = await (async (): Promise<TExtent | undefined> => {
          if (capture.status === "REFUNDED") return "full";
          if (!is_reversal) return "partial";
          if (is_whole([taken], whole)) return "full";
          if (!order_id) return "partial";
          const earlier = await prior_refunds(order_id, cid, refund.id);
          if (earlier === "refused") return "unsized";
          if (!earlier) return undefined;
          return is_whole([...earlier, taken], whole) ? "full" : "partial";
        })();
        if (!extent)
          return new Response(`order lookup failed: ${order_id}`, {
            status: 503,
          });
        return reverse_settled(ev, {
          sttl_id: cid,
          extent,
          status: capture.status,
          refunded: money(part?.value, part?.currency_code),
          charged: money(gross?.value, gross?.currency_code),
          owner: async () => capture.custom_id,
        });
      }
      case "PAYMENT.SALE.REFUNDED":
      case "PAYMENT.SALE.REVERSED": {
        // a v1 refund naming its sale, or the reversed sale itself
        const r = ev.resource as {
          id?: string;
          sale_id?: string;
          amount?: { total?: string; currency?: string };
        };
        const is_sale =
          (ev as { resource_type?: string }).resource_type === "sale";
        const sale_id = is_sale ? r.id : r.sale_id;
        if (!sale_id) return unroutable(ev, "missing refunded sale id");

        const sale = await fetch_resource(() => paypal.get_sale(sale_id));
        if (typeof sale === "number")
          return unroutable(ev, `paypal answered ${sale} for sale ${sale_id}`);
        // "reversed" is a live sale state the vendored v1 spec leaves out
        const state: string | undefined = sale.state;
        const whole = sale.amount;
        const is_reversal = ev.event_type === "PAYMENT.SALE.REVERSED";
        return reverse_settled(ev, {
          sttl_id: sale_id,
          // v1 sales carry no refunded total and no list of their refunds, so
          // unlike a capture's, a reversal can't be summed with earlier refunds
          caveat: is_reversal
            ? "earlier refunds of this sale could not be counted, so this reversal was judged on its own. ops must check whether the charge is now fully taken back."
            : undefined,
          extent:
            state === "refunded" ||
            state === "reversed" ||
            (is_reversal &&
              !is_sale &&
              is_whole(
                [{ value: r.amount?.total, currency: r.amount?.currency }],
                { value: whole?.total, currency: whole?.currency }
              ))
              ? "full"
              : "partial",
          status: state,
          refunded: money(r.amount?.total, r.amount?.currency),
          charged: money(whole?.total, whole?.currency),
          owner: async () => {
            const subs_id = sale.billing_agreement_id;
            if (!subs_id) return undefined;
            const sub = await fetch_resource(() =>
              paypal.get_subscription(subs_id)
            );
            return typeof sub === "number" ? undefined : sub.custom_id;
          },
        });
      }
      case "PAYMENT.CAPTURE.DENIED": {
        const { id: cid, custom_id: don_id } = ev.resource as Capture;
        if (!cid || !don_id)
          return unroutable(ev, "missing capture or donation id");

        const don = await donation_get(don_id);
        if (!don)
          return new Response(`donation not found: ${don_id}`, { status: 500 });
        if (!AWAITING_CAPTURE.has(don.status))
          return new Response(`donation is ${don.status}`, { status: 200 });

        // sent before the write: once failed, a redelivery stops at the
        // status above and a failed send is never retried
        await fiat_monitor.send_alert({
          type: "NOTICE",
          from: `paypal-webhook-${stage}`,
          title: "PayPal Capture Denied",
          body: [
            `donation ${don_id}, capture ${cid}, event ${ev.id}`,
            "paypal denied a capture it had held pending. the donor saw the thank-you page; the donation is marked failed and nothing was settled.",
          ].join("\n"),
        });
        await db.transaction(async (tx) => {
          const state = await donation_settle_state_locked(tx, don_id);
          if (state && AWAITING_CAPTURE.has(state.status))
            await donation_update(tx, don_id, { status: "failed" });
        });
        return new Response("donation failed", { status: 200 });
      }
      case "PAYMENT.CAPTURE.PENDING": {
        const {
          id: cid,
          custom_id: don_id,
          status_details,
        } = ev.resource as Capture;
        report_degraded(new Error("[paypal webhook] capture pending"), {
          capture_id: cid,
          don_id,
          reason: status_details?.reason,
        });
        return new Response("capture pending", { status: 200 });
      }
      case "PAYMENT.SALE.COMPLETED": {
        const { id: sale_id, billing_agreement_id: ev_subs_id } =
          ev.resource as Sale;
        if (!sale_id) return unroutable(ev, "missing sale id");

        // idempotency: already processed this sale. rechecked under the order
        // row's lock below — this one only spares a redelivery the paypal
        // fetches and the settle math.
        if (await settlement_exists(sale_id)) {
          console.info(
            `[paypal webhook] sale ${sale_id} already settled, skipping`
          );
          await requeue_sale(sale_id, ev_subs_id);
          return new Response("already processed", { status: 200 });
        }

        // as for a capture: settled from paypal's copy, not the event body
        const sale = await fetch_resource(() => paypal.get_sale(sale_id));
        // a signed event naming a charge paypal can't find is a lookup of ours
        // gone wrong, not a bad payload: held for redelivery, since acking it
        // drops a recurring charge
        if (typeof sale === "number") {
          report_error(
            new Error(`[paypal webhook] paypal answered ${sale} for sale`),
            { event_id: ev.id, sale_id, http_status: sale }
          );
          return new Response("sale lookup refused", { status: 503 });
        }
        const {
          create_time: create_date = new Date().toISOString(),
          // the signed event's id stands in when paypal's copy leaves it off
          billing_agreement_id: subs_id = ev_subs_id,
          transaction_fee,
          receivable_amount,
          amount: sale_amount,
          exchange_rate: rate, // unit per usd
          state,
        } = sale;
        if (!state || !SETTLEABLE_SALE.has(state))
          return unroutable(ev, `sale ${sale_id} is ${state}`);

        if (!sale_amount?.total)
          return unroutable(ev, `missing total for sale: ${sale_id}`);

        const tf = transaction_fee?.value ?? 0;
        // receivable_amount only present on currency conversions
        const net = receivable_amount?.value ?? +sale_amount.total - +tf;
        const cur = receivable_amount?.currency ?? sale_amount.currency;

        const settled: ISettlement = {
          net: +net,
          fee: rate ? +tf * +rate : +tf,
          c: cur,
        };

        if (!subs_id) return unroutable(ev, "missing billing agreement id");
        const sub = await fetch_resource(() =>
          paypal.get_subscription(subs_id)
        );
        if (typeof sub === "number")
          return unroutable(
            ev,
            `paypal answered ${sub} for subscription ${subs_id}`
          );
        if (!sub)
          return new Response("subscription not found", { status: 400 });
        // no redelivery supplies either on its own. custom_id is patchable
        // (subscriptions PATCH, add/replace); after patching it, resend this
        // event by the event_id in the report. of the subscriber, only
        // shipping_address is patchable, so a missing subscriber or email has
        // no recovery.
        if (!sub.subscriber) return unroutable(ev, "missing subscriber info");
        if (!sub.custom_id) return unroutable(ev, "missing onhold id");
        const don_id = sub.custom_id;
        const { email_address: email, shipping_address, name } = sub.subscriber;
        if (!email) return unroutable(ev, "missing subscriber email");

        const donor = donor_update(email, name, shipping_address?.address);

        const don = await donation_get(don_id);
        if (!don) return new Response("don record not found", { status: 500 });

        // a charge settles whatever state its subscription is in by now: a donor
        // who cancels after paying was still charged. only a row this sale has
        // to create needs the plan — built before opening the tx, since
        // build_sub_record makes an external paypal.get_plan call we don't want
        // to hold a db connection open for.
        let subs_db: ISub | undefined;
        if (!(await sub_get(subs_id))) {
          // the one gap a redelivery closes: paypal fills in billing_info on
          // activation
          if (sub.status === "APPROVAL_PENDING" || sub.status === "APPROVED")
            return new Response(`subscription ${subs_id} is ${sub.status}`, {
              status: 400,
            });
          const rec = await build_sub_record({
            subs_id,
            sub,
            don,
            // use the subscriber email directly: if SALE.COMPLETED races ahead
            // of BILLING.SUBSCRIPTION.ACTIVATED, don.from_email is still the
            // placeholder, and sub_put's onConflictDoNothing would freeze it in.
            from_email: email,
            last_charge_time: create_date,
          });
          if (typeof rec === "string") return unroutable(ev, rec);
          if ("refused" in rec)
            return unroutable(
              ev,
              `paypal answered ${rec.refused} for plan ${sub.plan_id}`
            );
          subs_db = rec;
        }
        const next_billing = sub.billing_info?.next_billing_time;

        const sttl_record = {
          id: sale_id,
          date: create_date,
          currency: cur,
          fee: settled.fee,
          net: settled.net,
        };

        const p = await db.transaction(async (tx) => {
          // the guard above read outside this transaction, so two concurrent
          // deliveries of one sale can both pass it. re-decide under the order
          // row's write lock: without it the loser sees the settlement the
          // winner wrote, takes the rebill branch, and clones a donation that
          // loses on the sttl_id unique index.
          const state = await donation_settle_state_locked(tx, don_id);
          if (!state) throw new Error(`don record not found: ${don_id}`);
          if (await settlement_exists(sale_id, tx))
            return {
              dup: true as const,
              row: await donation_by_sttl_id(sale_id, tx),
              msgs: [],
            };

          const don = await donation_update(tx, don_id, { ...donor });
          // upsert subscription row before referencing its FK on the donation;
          // BILLING.SUBSCRIPTION.ACTIVATED may not have landed yet (paypal does
          // not guarantee webhook ordering).
          if (subs_db) await sub_put(tx, subs_db);
          // sub_put leaves an existing row alone; each charge moves it on
          if (next_billing)
            await sub_update(tx, subs_id, {
              next_billing: new Date(next_billing).toISOString(),
            });

          const result = don.settlement
            ? calc_donation_settle({
                kind: "rebill",
                order_id: don_id,
                prior: don as IDonationSettled,
                settlement: sttl_record,
                subs_id,
                new_id: crypto.randomUUID(),
              })
            : calc_donation_settle({
                kind: "first-recurring",
                order_id: don_id,
                prior: don,
                settlement: sttl_record,
                subs_id,
              });

          // noop reaches here only from the first-recurring branch — a rebill
          // clones the order row rather than settling it, so it never yields
          // one. the order row it would have settled is already reversed.
          if (result.op === "noop")
            return { dup: false as const, row: don, msgs: [] };
          return result.op === "update"
            ? {
                dup: false as const,
                row: await donation_update(tx, result.order_id, result.patch),
                msgs: result.msgs,
              }
            : {
                dup: false as const,
                row: await donation_put(tx, result.row),
                msgs: result.msgs,
              };
        });

        if (p.dup) {
          await requeue(p.row, don_id);
          return new Response("already processed", { status: 200 });
        }
        await enqueue(...p.msgs);

        return Response.json({ id: p.row.id });
      }
    }
    console.info(
      `[paypal webhook] not handled: ${ev.event_type} ${ev.id} resource ${ev.resource?.id}`
    );
    return new Response(`event type not handled: ${ev.event_type}`, {
      status: 201,
    });
  } catch (error) {
    return report_resp(error, "error processing webhook");
  }
}
