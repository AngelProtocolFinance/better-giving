import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDonationIntent } from "@/donations/schema";
import type { Ctx, IntentResult } from "./types";

const stripe_intent_mock = vi.hoisted(() => vi.fn());
const paypal_intent_mock = vi.hoisted(() => vi.fn());
const crypto_intent_mock = vi.hoisted(() => vi.fn());
const chariot_intent_mock = vi.hoisted(() => vi.fn());
const capture_order_mock = vi.hoisted(() => vi.fn());
const to_fn_mock = vi.hoisted(() => vi.fn());

vi.mock("./stripe", () => ({ stripe_intent: stripe_intent_mock }));
vi.mock("./paypal", () => ({ paypal_intent: paypal_intent_mock }));
vi.mock("./crypto", () => ({ crypto_intent: crypto_intent_mock }));
vi.mock("./chariot", () => ({ chariot_intent: chariot_intent_mock }));
vi.mock("./paypal/capture-order", () => ({
  capture_order: capture_order_mock,
}));

const cookie_parse_mock = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const cookie_serialize_mock = vi.hoisted(() =>
  vi.fn().mockResolvedValue("donations=stub")
);

vi.mock("#/.server/donation-recipient", () => ({ to_fn: to_fn_mock }));
vi.mock("#/.server/cookie", () => ({
  donations_cookie: {
    parse: cookie_parse_mock,
    serialize: cookie_serialize_mock,
  },
}));

const { action } = await import("./route");

const to_stub = {
  to_id: "1",
  to_type: "npo" as const,
  to_name: "ACME",
  to_tip_allowed: true,
  to_members: [],
};

const valid_body = (via: IDonationIntent["via"]): unknown => ({
  via,
  via_extra: "",
  amount: { base: 100, tip: 0, fee_allowance: 0 },
  currency: "USD",
  to_id: "1",
  donor: { email: "a@b.co" },
  source: "bg-marketplace",
  frequency: "one-time",
});

const post = (body: unknown): Request =>
  new Request("https://x/api/donation-intents", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const invoke = async (request: Request): Promise<Response> =>
  (await action({ request } as any)) as Response;

const ok_result = (
  don_id: string,
  body: Record<string, any>
): IntentResult => ({
  don_id,
  body,
});

beforeEach(() => {
  vi.clearAllMocks();
  to_fn_mock.mockResolvedValue(to_stub);
});

describe("api.donation-intents action", () => {
  it("routes via=card to stripe_intent with ctx.via='card'", async () => {
    stripe_intent_mock.mockResolvedValue(
      ok_result("don-1", { client_secret: "cs", order_id: "don-1" })
    );
    const res = await invoke(post(valid_body("card")));

    expect(stripe_intent_mock).toHaveBeenCalledOnce();
    const ctx: Ctx = stripe_intent_mock.mock.calls[0]![0];
    expect(ctx.via).toBe("card");
    expect(ctx.to).toEqual(to_stub);
    expect(ctx.donor.email).toBe("a@b.co");

    expect(res!.status).toBe(200);
    // browser fetch forbids reading set-cookie; assert cookie was built with don_id key
    expect(cookie_serialize_mock).toHaveBeenCalledWith(
      expect.objectContaining({ "don-1": expect.any(Number) })
    );
    await expect(res!.json()).resolves.toEqual({
      client_secret: "cs",
      order_id: "don-1",
    });
  });

  it("routes via=bank to stripe_intent with ctx.via='bank'", async () => {
    stripe_intent_mock.mockResolvedValue(ok_result("don-2", { ok: true }));
    await invoke(post(valid_body("bank")));

    const ctx: Ctx = stripe_intent_mock.mock.calls[0]![0];
    expect(ctx.via).toBe("bank");
    expect(paypal_intent_mock).not.toHaveBeenCalled();
  });

  it("routes via=paypal to paypal_intent", async () => {
    paypal_intent_mock.mockResolvedValue(
      ok_result("don-3", { tx_id: "tx", don_id: "don-3" })
    );
    const res = await invoke(post(valid_body("paypal")));

    expect(paypal_intent_mock).toHaveBeenCalledOnce();
    expect(stripe_intent_mock).not.toHaveBeenCalled();
    await expect(res!.json()).resolves.toEqual({
      tx_id: "tx",
      don_id: "don-3",
    });
  });

  it("routes via=crypto to crypto_intent", async () => {
    crypto_intent_mock.mockResolvedValue(ok_result("don-4", { id: "pay-x" }));
    const res = await invoke(post(valid_body("crypto")));

    expect(crypto_intent_mock).toHaveBeenCalledOnce();
    await expect(res!.json()).resolves.toEqual({ id: "pay-x" });
  });

  it("routes via=chariot to chariot_intent", async () => {
    chariot_intent_mock.mockResolvedValue(ok_result("don-5", { id: "don-5" }));
    const res = await invoke(post(valid_body("chariot")));

    expect(chariot_intent_mock).toHaveBeenCalledOnce();
    await expect(res!.json()).resolves.toEqual({ id: "don-5" });
  });

  it("returns 404 when recipient not found", async () => {
    to_fn_mock.mockResolvedValueOnce(undefined);
    const res = await invoke(post(valid_body("card")));

    expect(res!.status).toBe(404);
    expect(stripe_intent_mock).not.toHaveBeenCalled();
  });

  it("passes provider Response through without cookie wrap", async () => {
    stripe_intent_mock.mockResolvedValue(
      new Response("less than min", { status: 400 })
    );
    const res = await invoke(post(valid_body("card")));

    expect(res!.status).toBe(400);
    expect(cookie_serialize_mock).not.toHaveBeenCalled();
    await expect(res!.text()).resolves.toBe("less than min");
  });

  it("PATCH calls capture_order and bypasses via dispatch", async () => {
    capture_order_mock.mockResolvedValue({ captured: true });
    const req = new Request("https://x/api/donation-intents", {
      method: "PATCH",
      body: JSON.stringify({ order_id: "o1", don_id: "d1" }),
      headers: { "content-type": "application/json" },
    });
    const res = await invoke(req);

    expect(capture_order_mock).toHaveBeenCalledWith({
      order_id: "o1",
      don_id: "d1",
    });
    expect(stripe_intent_mock).not.toHaveBeenCalled();
    await expect(res!.json()).resolves.toEqual({ captured: true });
  });

  it("PATCH returns 400 on missing fields", async () => {
    const req = new Request("https://x/api/donation-intents", {
      method: "PATCH",
      body: JSON.stringify({ order_id: "o1" }),
      headers: { "content-type": "application/json" },
    });
    const res = await invoke(req);

    expect(res!.status).toBe(400);
    expect(capture_order_mock).not.toHaveBeenCalled();
  });
});
