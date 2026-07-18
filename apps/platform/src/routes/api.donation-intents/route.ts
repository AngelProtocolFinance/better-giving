import type { ActionFunction } from "react-router";
import { getDotPath, safeParse } from "valibot";
import {
  donations_cookie,
  type IDonationIntentExpiries,
} from "#/.server/cookie";
import { to_fn } from "#/.server/donation-recipient";
import { to_from } from "@/donations/helpers";
import { intent as schema } from "@/donations/schema";
import { resp } from "@/helpers/https";
import { chariot_intent } from "./chariot";
import { crypto_intent } from "./crypto";
import { paypal_intent } from "./paypal";
import { capture_order } from "./paypal/capture-order";
import { stripe_intent } from "./stripe";
import type { Ctx, Provider } from "./types";

const providers = {
  card: stripe_intent,
  bank: stripe_intent,
  paypal: paypal_intent,
  crypto: crypto_intent,
  chariot: chariot_intent,
} satisfies Record<Ctx["via"], Provider>;

const json_with_cookie_fn =
  (existing: null | IDonationIntentExpiries) =>
  async (data: Record<string, any>, key: string) => {
    const now = Date.now();
    const obj = existing || {};

    // Remove expired keys
    for (const k of Object.keys(obj)) {
      if (obj[k] < now) {
        delete obj[k];
      }
    }

    obj[key] = now + 15 * 60 * 1000; // 15 minutes

    // keep only top 5 most recent keys
    const sorted_entries = Object.entries(obj)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const expiry_per_id = Object.fromEntries(sorted_entries);

    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json",
        "set-cookie": await donations_cookie.serialize(expiry_per_id),
      },
    });
  };

export const action: ActionFunction = async ({ request }) => {
  // server-side paypal capture
  if (request.method === "PATCH") {
    const { order_id, don_id } = await request.json();
    if (!order_id || !don_id)
      return resp.status(400, "missing order_id/don_id");
    const capture = await capture_order({ order_id, don_id });
    return Response.json(capture);
  }

  const expiry_per_intent: IDonationIntentExpiries | null =
    await donations_cookie.parse(request.headers.get("cookie"));

  const parsed = safeParse(schema, await request.json());
  if (parsed.issues) {
    const i = parsed.issues[0];
    return resp.status(400, `${getDotPath(i)}: ${i.message}`);
  }
  const { to_id, via, via_extra, donor, ...intent } = parsed.output;

  const to = await to_fn(to_id);
  if (!to) {
    return resp.txt(`Recipient:${to_id} not found`, 404);
  }
  const from = to_from(donor);

  const ctx: Ctx = { to, from, donor, via, via_extra, intent };
  const result = await providers[via](ctx);
  if (result instanceof Response) return result;

  const json_with_cookie = json_with_cookie_fn(expiry_per_intent);
  return await json_with_cookie(result.body, result.don_id);
};
