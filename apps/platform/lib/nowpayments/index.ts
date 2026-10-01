import type { NP } from "./types";

interface Config {
  baseUrl: string;
  apiToken: string;
}
interface Init<T extends string> {
  method?: T extends "GET" ? never : T;
  data?: T extends "GET" ? never : object;
}

const TIMEOUT_MS = 10_000;
const RATE_PROBE_USD = 100;
/**
 * the account pays out to usdc on polygon; nowpayments' lowercase `code` for
 * it, and no endpoint reads it. without `currency_to`, min-amount quotes the
 * coin to itself (the bare network floor), not the conversion to the payout
 */
const OUTCOME_CURRENCY = "usdcmatic";

const is_positive = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x > 0;

// not `status`: `report_error` keeps anything with a 4xx `status` off sentry,
// and a 4xx from nowpayments is our misconfiguration, not the donor's
export class NowpaymentsError extends Error {
  constructor(
    readonly http_status: number,
    readonly body: string,
    path: string
  ) {
    super(`nowpayments ${path} ${http_status}: ${body}`);
    this.name = "NowpaymentsError";
  }
}

/** a 200 that quotes no usable minimum: the pair isn't payable, not an outage */
export class NowpaymentsNoMinimumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NowpaymentsNoMinimumError";
  }
}

export class Nowpayments {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private async send<R, T extends string = "GET">(
    path: string,
    init?: Init<T> & { params?: Record<string, string> }
  ): Promise<R> {
    const url = new URL(this.config.baseUrl);
    url.pathname = path;
    for (const [k, v] of Object.entries(init?.params ?? {})) {
      url.searchParams.set(k, v);
    }
    const req = new Request(url, {
      method: init?.method ?? "GET",
      body: init?.data ? JSON.stringify(init.data) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    req.headers.set("x-api-key", this.config.apiToken);
    req.headers.set("content-type", "application/json");

    const res = await fetch(req);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new NowpaymentsError(res.status, body, path);
    }
    return res.json();
  }

  /** usd per unit of `token_code`, fees excluded; throws unless the quote is a positive number */
  async estimate(token_code: string) {
    const path = "v1/estimate";
    // quoted from the fiat side, the direction nowpayments documents; the
    // crypto amount keeps its precision where a usd figure would round a
    // sub-cent token to 0
    const { amount_from, estimated_amount } = await this.send<NP.Estimate>(
      path,
      {
        params: {
          amount: RATE_PROBE_USD.toString(),
          currency_from: "usd",
          currency_to: token_code,
        } satisfies NP.Estimate.Params,
      }
    );
    const usdpu = amount_from / estimated_amount;
    if (!is_positive(estimated_amount) || !is_positive(usdpu)) {
      throw new Error(
        `nowpayments ${path} ${token_code}: amount_from:${amount_from} estimated_amount:${estimated_amount}`
      );
    }
    return { usdpu };
  }

  /** throws unless both figures are positive numbers: a NaN minimum passes every `<` check */
  async min_amount(token_code: string) {
    const path = "v1/min-amount";
    const { min_amount: min, fiat_equivalent: min_usd } =
      await this.send<NP.MinAmount>(path, {
        params: {
          currency_from: token_code,
          currency_to: OUTCOME_CURRENCY,
          fiat_equivalent: "usd",
        } satisfies NP.MinAmount.Params,
      });
    if (!is_positive(min) || !is_positive(min_usd)) {
      throw new NowpaymentsNoMinimumError(
        `nowpayments ${path} ${token_code}: min_amount:${min} fiat_equivalent:${min_usd}`
      );
    }
    return { min, min_usd };
  }

  async payment_invoice(payload: NP.Payment.Request) {
    return this.send<NP.NewPayment, "POST">("v1/invoice-payment", {
      method: "POST",
      data: payload,
    });
  }

  async invoice(payload: NP.Invoice.Request) {
    return this.send<NP.Invoice, "POST">("v1/invoice", {
      method: "POST",
      data: payload,
    });
  }

  /** null when nowpayments answers 4xx: an id it doesn't know or won't show this key */
  async find_payment(payment_id: number): Promise<NP.PaymentStatus | null> {
    return this.send<NP.PaymentStatus>(`v1/payment/${payment_id}`).catch(
      (err: unknown) => {
        if (err instanceof NowpaymentsError && err.http_status < 500) {
          return null;
        }
        throw err;
      }
    );
  }
}
