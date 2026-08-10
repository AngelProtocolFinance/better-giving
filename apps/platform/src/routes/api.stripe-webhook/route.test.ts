import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const construct_event_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const intent_succeeded_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/stripe", () => ({
  stripe: { webhooks: { constructEvent: construct_event_mock } },
}));
vi.mock("@/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));
vi.mock("$/pg/queries/subscription", () => ({ sub_update: vi.fn() }));
vi.mock("./handlers", () => ({
  handle_charge_refunded: vi.fn(),
  handle_intent_failed: vi.fn(),
  handle_intent_requires_action: vi.fn(),
  handle_setup_intent_failed: vi.fn(),
  handle_setup_intent_succeeded: vi.fn(),
}));
vi.mock("./handlers/intent-suceeded", () => ({
  handle_intent_succeeded: intent_succeeded_mock,
}));
vi.mock("./handlers/subscription-created", () => ({
  handle_subscription_created: vi.fn(),
}));

const { action } = await import("./route");
const { BalanceTxnNotReadyError } = await import("./helpers/settled");

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("https://x/api/stripe-webhook", {
    method: "POST",
    body,
    headers,
  });

const invoke = async (request: Request): Promise<Response> =>
  (await action({ request } as any)) as Response;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api.stripe-webhook action", () => {
  it("returns 400 and reports when the signature doesn't verify", async () => {
    construct_event_mock.mockImplementation(() => {
      throw new Stripe.errors.StripeSignatureVerificationError(
        "t=0,v1=deadbeef",
        '{"ping":1}',
        {
          message:
            "No signatures found matching the expected signature for payload",
        }
      );
    });

    const res = await invoke(
      post('{"ping":1}', { "stripe-signature": "t=0,v1=deadbeef" })
    );

    expect(res.status).toBe(400);
    expect(report_error_mock).toHaveBeenCalledOnce();
    // the prefix is what separates the dedicated branch from the generic 400
    // fallback below it, whose body is the raw error message
    await expect(res.text()).resolves.toMatch(
      /^stripe signature verification failed: No signatures found/
    );
  });

  it("returns 403 without verifying when the signature header is absent", async () => {
    const res = await invoke(post('{"ping":1}'));

    expect(res.status).toBe(403);
    expect(construct_event_mock).not.toHaveBeenCalled();
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("returns 503 unreported when the balance txn isn't ready yet", async () => {
    construct_event_mock.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1" } },
    });
    intent_succeeded_mock.mockRejectedValue(
      new BalanceTxnNotReadyError("pi_1")
    );

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(503);
    expect(report_error_mock).not.toHaveBeenCalled();
  });

  it("returns 200 for a verified event it handles", async () => {
    construct_event_mock.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_2" } },
    });
    intent_succeeded_mock.mockResolvedValue(undefined);

    const res = await invoke(post("{}", { "stripe-signature": "t=1,v1=ok" }));

    expect(res.status).toBe(200);
    expect(intent_succeeded_mock).toHaveBeenCalledOnce();
  });
});
