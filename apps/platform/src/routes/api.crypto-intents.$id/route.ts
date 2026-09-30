import { is_custom, tokens_map } from "@better-giving/crypto";
import type { LoaderFunction } from "react-router";
import {
  integer,
  minValue,
  parse,
  pipe,
  string,
  transform,
  union,
  uuid,
} from "valibot";
import { get_session } from "#/.server/auth";
import {
  donations_cookie,
  type IDonationIntentExpiries,
} from "#/.server/cookie";
import type { Payment } from "#/types/crypto";
import type { IDonation } from "@/donations";
import { amnt_sum } from "@/donations/helpers";
import { resp } from "@/helpers/https";
import { usdpu_of } from "@/nowpayments/usdpu";
import { deposit_addr } from "$/deposit-addr";
import { np } from "$/kit/nowpayments";
import { donation_get } from "$/pg/queries/donation";

const int = pipe(
  string(),
  transform((x) => +x),
  integer(),
  minValue(0)
);
/**
 * either id leads to a deposit address and the donation behind it, so it
 * answers only the donor who created it: this browser's intent cookie (15 min),
 * or the signed-in owner resuming from the dashboard
 */
const intent_reader = async (request: Request) => {
  const held: IDonationIntentExpiries | null = await donations_cookie.parse(
    request.headers.get("cookie")
  );
  const now = Date.now();
  const live = new Set(
    Object.entries(held ?? {})
      .filter(([, expiry]) => expiry > now)
      .map(([id]) => id)
  );
  const { user } = await get_session(request);
  if (!live.size && !user) return null;

  /** `don` spares the lookup when the caller already holds the row */
  return async (order_id: string, don?: IDonation) => {
    if (live.has(order_id)) return true;
    if (!user) return false;
    const owned = don ?? (await donation_get(order_id));
    return owned?.from_email.toLowerCase() === user.email.toLowerCase();
  };
};

const np_payment = async (
  payment_id: number,
  may_read: (order_id: string) => Promise<boolean>
) => {
  const p = await np.find_payment(payment_id);
  if (!p || !(await may_read(p.order_id))) return resp.status(404);
  if (p.payment_status !== "waiting") throw resp.status(410);

  return {
    id: p.payment_id,
    address: p.pay_address,
    extra_address: p.payin_extra_id ?? undefined,
    amount: p.pay_amount,
    currency: p.pay_currency.toUpperCase(),
    usdpu: await usdpu_of(np, p.pay_currency),
    description: p.order_description,
    order_id: p.order_id,
  } satisfies Payment;
};

export const loader: LoaderFunction = async ({ params, request }) => {
  const id = parse(union([pipe(string(), uuid()), int]), params.id);

  const may_read = await intent_reader(request);
  if (!may_read) return resp.status(404);

  if (typeof id === "number") return np_payment(id, may_read);

  const don = await donation_get(id);
  if (!don || !(await may_read(id, don))) return resp.status(404);
  if (don.status !== "intent") return resp.status(410);

  const token = tokens_map[don.currency];
  if (!token) {
    console.error(`crypto intent ${don.id}: ${don.currency} not in token map`);
    return resp.status(500);
  }

  // our own address would take a deposit nowpayments never tracks; the
  // intent recorded the order's payment id in via_extra
  if (!is_custom(token.id)) {
    const payment_id = Number(don.via_extra);
    if (!don.via_extra || !Number.isSafeInteger(payment_id)) {
      return resp.status(404);
    }
    return np_payment(payment_id, async (order_id) => order_id === don.id);
  }

  const addr = deposit_addr(token.network);
  if (!addr) {
    console.error(
      `crypto intent ${don.id}: no deposit address for ${token.network}`
    );
    return resp.status(500);
  }

  const total = amnt_sum(don.amount);
  const data: Payment = {
    order_id: don.id,
    id: don.id,
    address: addr,
    amount: total,
    currency: don.currency,
    description: `Donation to ${don.to_name}`,
    usdpu: 1 / don.upusd,
  };
  return resp.json(data);
};
