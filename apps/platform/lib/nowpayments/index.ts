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

  /** usd per unit of `token_code`, fees excluded */
  async estimate(token_code: string) {
    // quoted from the fiat side, the direction nowpayments documents; the
    // crypto amount keeps its precision where a usd figure would round a
    // sub-cent token to 0
    const { amount_from, estimated_amount } = await this.send<NP.Estimate>(
      "v1/estimate",
      {
        params: {
          amount: RATE_PROBE_USD.toString(),
          currency_from: "usd",
          currency_to: token_code,
        } satisfies NP.Estimate.Params,
      }
    );
    return { usdpu: amount_from / estimated_amount };
  }

  async min_amount(token_code: string) {
    const { min_amount: min, fiat_equivalent: min_usd } = await this.send<
      Required<NP.MinAmount>
    >("v1/min-amount", {
      params: {
        currency_from: token_code,
        fiat_equivalent: "usd",
      } satisfies NP.MinAmount.Params,
    });
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
