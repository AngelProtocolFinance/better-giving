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
import { npo_program_owned } from "$/pg/queries/program";
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

    // remove expired keys
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

// a 4xx body reaches the donor verbatim; the detail stays in the log
const refused = (detail: string) => {
  console.info(`[resp] 400 - ${detail}`);
  return resp.txt(
    "We couldn't process this donation. Please refresh the page and try again.",
    400
  );
};

// json can't encode `undefined`, so it marks a body that didn't parse
const json_body = (request: Request): Promise<unknown> =>
  request.json().catch(() => undefined);

export const action: ActionFunction = async ({ request }) => {
  // server-side paypal capture
  if (request.method === "PATCH") {
    const body = await json_body(request);
    if (body === undefined) return refused("body is not json");
    const { order_id, don_id } = (body ?? {}) as {
      order_id?: string;
      don_id?: string;
    };
    if (!order_id || !don_id)
      return resp.status(400, "missing order_id/don_id");
    const capture = await capture_order({ order_id, don_id });
    return Response.json(capture);
  }

  const expiry_per_intent: IDonationIntentExpiries | null =
    await donations_cookie.parse(request.headers.get("cookie"));

  const body = await json_body(request);
  if (body === undefined) return refused("body is not json");
  const parsed = safeParse(schema, body);
  if (parsed.issues) {
    const i = parsed.issues[0];
    return refused(`${getDotPath(i)}: ${i.message}`);
  }
  const { to_id, via, via_extra, donor, program, ...rest } = parsed.output;

  const to = await to_fn(to_id, { open_at: new Date() });
  if (!to) {
    const recipient = typeof to_id === "number" ? "nonprofit" : "fundraiser";
    console.info(`[resp] 404 - ${recipient}:${to_id} not found or closed`);
    return resp.txt(
      `This ${recipient} isn't accepting donations right now.`,
      404
    );
  }
  const from = to_from(donor);

  // settlement credits intent.program; one the recipient npo doesn't own is
  // dropped so the gift still goes through, just unattributed
  const owned =
    program &&
    typeof to_id === "number" &&
    (await npo_program_owned(to_id, program.id));
  const intent = owned ? { ...rest, program } : rest;

  const ctx: Ctx = { to, from, donor, via, via_extra, intent };
  const result = await providers[via](ctx);
  if (result instanceof Response) return result;

  const json_with_cookie = json_with_cookie_fn(expiry_per_intent);
  return await json_with_cookie(result.body, result.don_id);
};
