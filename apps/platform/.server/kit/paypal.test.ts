import { PayPalSDK } from "@better-giving/paypal";
import { afterEach, describe, expect, test, vi } from "vitest";

const new_sdk = () =>
  new PayPalSDK({
    client_id: "id",
    client_secret: "secret",
    api_url: "https://api-m.sandbox.paypal.com",
  });

const never_answer = (_: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
  });

/** a paypal that issues a token and never answers anything else */
function hang_api() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
    String(url).endsWith("/v1/oauth2/token")
      ? Response.json({ access_token: "tok", expires_in: 32400 })
      : never_answer(url, init)
  );
}

/** node arms `AbortSignal.timeout` on a timer vitest's fake clock can't reach */
function fake_timeout_signals() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(
      () => c.abort(new DOMException("signal timed out", "TimeoutError")),
      ms
    );
    return c.signal;
  });
}

/** where `call` stands just before 30s, and once 30s have passed */
async function at_the_bound(call: () => Promise<unknown>) {
  const settled = call().then(
    () => "resolved",
    (e: unknown) => e
  );
  const now = () => Promise.race([settled, Promise.resolve("pending")]);
  await vi.advanceTimersByTimeAsync(29_999);
  const early = await now();
  await vi.advanceTimersByTimeAsync(1);
  return { early, late: await now() };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("paypal sdk", () => {
  test.each([
    ["create_order", (s: PayPalSDK) => s.create_order({} as any, "r")],
    ["get_order", (s: PayPalSDK) => s.get_order("o")],
    ["capture_order", (s: PayPalSDK) => s.capture_order("o", "r")],
    ["create_product", (s: PayPalSDK) => s.create_product({} as any)],
    ["create_plan", (s: PayPalSDK) => s.create_plan({} as any, "r")],
    ["get_plans", (s: PayPalSDK) => s.get_plans()],
    ["get_plan", (s: PayPalSDK) => s.get_plan("p")],
    ["deactivate_plan", (s: PayPalSDK) => s.deactivate_plan("p")],
    [
      "create_subscription",
      (s: PayPalSDK) => s.create_subscription({} as any, "r"),
    ],
    ["get_subscription", (s: PayPalSDK) => s.get_subscription("s")],
    ["get_capture", (s: PayPalSDK) => s.get_capture("c")],
    ["get_sale", (s: PayPalSDK) => s.get_sale("s")],
    [
      "cancel_subscription",
      (s: PayPalSDK) => s.cancel_subscription("s", { reason: "x" }),
    ],
  ])("a hung %s call rejects after 30s", async (_, call) => {
    fake_timeout_signals();
    hang_api();
    const sdk = new_sdk();

    const { early, late } = await at_the_bound(() => call(sdk));

    expect(early).toBe("pending");
    expect(late).toMatchObject({ name: "TimeoutError" });
  });

  test("a hung token request rejects after 30s", async () => {
    fake_timeout_signals();
    vi.spyOn(globalThis, "fetch").mockImplementation(never_answer);

    const { early, late } = await at_the_bound(() => new_sdk().get_order("o"));

    expect(early).toBe("pending");
    expect(late).toMatchObject({ name: "TimeoutError" });
  });
});
