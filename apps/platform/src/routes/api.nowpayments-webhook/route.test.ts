import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const capture_exception_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const write_on_mock = vi.hoisted(() => vi.fn());
const send_alert_mock = vi.hoisted(() => vi.fn());

vi.mock("@sentry/react-router", () => ({
  captureException: capture_exception_mock,
}));
vi.mock("$/env", () => ({
  nowpayments: { ipn_secret: "ipn-secret" },
  stage: "test",
}));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$/pg/queries/donation")>()),
  donation_get: donation_get_mock,
}));
vi.mock("./handlers/write", () => ({ write_on: write_on_mock }));
vi.mock("./handlers/confirming", () => ({ handle_confirming: vi.fn() }));
vi.mock("./handlers/failed", () => ({ handle_failed: vi.fn() }));
vi.mock("./handlers/repeat", () => ({ handle_repeat: vi.fn() }));
vi.mock("./handlers/settled", () => ({ handle_settled: vi.fn() }));

const { action } = await import("./route");
const { handle_confirming } = await import("./handlers/confirming");
const { handle_settled } = await import("./handlers/settled");

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("https://x/api/nowpayments-webhook", {
    method: "POST",
    body,
    headers,
  });

const invoke = async (request: Request): Promise<Response> =>
  (await action({ request } as any)) as Response;

const hmac = (canonical: string, secret = "ipn-secret"): string =>
  crypto.createHmac("sha512", secret).update(canonical).digest("hex");

/** payload keys written in sorted order, so the posted body is its own canonical form */
const deliver = (payload: Record<string, unknown>): Promise<Response> => {
  const body = JSON.stringify(payload);
  return invoke(post(body, { "x-nowpayments-sig": hmac(body) }));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("api.nowpayments-webhook action", () => {
  // the signature header here is arbitrary and never checked: the parse runs
  // first, so this branch is the one an anonymous caller reaches. both halves
  // of the assertion are the point — the status, so nowpayments stops retrying
  // a payload no retry can fix, and the silence, so a stranger cannot page us.
  it("returns 400 unreported when the body isn't json", async () => {
    const res = await invoke(
      post("not-json", { "x-nowpayments-sig": "deadbeef" })
    );

    expect(res.status).toBe(400);
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature header is absent", async () => {
    const res = await invoke(post('{"payment_status":"finished"}'));

    expect(res.status).toBe(400);
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("returns 400 unreported when the signature doesn't match the payload", async () => {
    const res = await invoke(
      post('{"payment_status":"waiting","order_id":"don-1","payment_id":42}', {
        "x-nowpayments-sig": "deadbeef",
      })
    );

    expect(res.status).toBe(400);
    expect(write_on_mock).not.toHaveBeenCalled();
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("dispatches a payload whose signature verifies", async () => {
    donation_get_mock.mockResolvedValue({ id: "don-1", status: "intent" });
    write_on_mock.mockResolvedValue({ op: "record" });
    const body =
      '{"payment_status":"waiting","order_id":"don-1","payment_id":42}';
    const sig = hmac(
      '{"order_id":"don-1","payment_id":42,"payment_status":"waiting"}'
    );

    const res = await invoke(post(body, { "x-nowpayments-sig": sig }));

    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toBe("ok");
    expect(write_on_mock).toHaveBeenCalledWith(
      "don-1",
      JSON.parse(body),
      { repeat: false },
      "record",
      { via_extra: "42" }
    );
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  // `fee` in the key order of nowpayments' own webhook example; they sign the
  // payload sorted at every depth
  const fee_body =
    '{"payment_status":"waiting","order_id":"don-1","payment_id":42,"fee":{"currency":"btc","depositFee":1,"withdrawalFee":3,"serviceFee":2}}';
  const fee_deep_sorted =
    '{"fee":{"currency":"btc","depositFee":1,"serviceFee":2,"withdrawalFee":3},"order_id":"don-1","payment_id":42,"payment_status":"waiting"}';

  it("verifies a nested fee posted unsorted and signed deep-sorted", async () => {
    donation_get_mock.mockResolvedValue({ id: "don-1", status: "intent" });
    write_on_mock.mockResolvedValue({ op: "record" });

    const res = await invoke(
      post(fee_body, { "x-nowpayments-sig": hmac(fee_deep_sorted) })
    );

    expect(res.status).toBe(200);
    expect(write_on_mock).toHaveBeenCalledOnce();
  });

  it("rejects a signature over a top-level-only sort", async () => {
    const sig = hmac(
      '{"fee":{"currency":"btc","depositFee":1,"withdrawalFee":3,"serviceFee":2},"order_id":"don-1","payment_id":42,"payment_status":"waiting"}'
    );

    const res = await invoke(post(fee_body, { "x-nowpayments-sig": sig }));

    expect(res.status).toBe(400);
    expect(write_on_mock).not.toHaveBeenCalled();
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("rejects a truncated signature with 400, not a compare throw", async () => {
    const sig = hmac(fee_deep_sorted).slice(0, 64);

    const res = await invoke(post(fee_body, { "x-nowpayments-sig": sig }));

    expect(res.status).toBe(400);
    expect(write_on_mock).not.toHaveBeenCalled();
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("acknowledges a payment with no order_id without touching a donation", async () => {
    const res = await deliver({
      order_id: null,
      payment_id: 42,
      payment_status: "finished",
    });

    expect(res.status).toBe(200);
    expect(write_on_mock).not.toHaveBeenCalled();
    expect(handle_settled).not.toHaveBeenCalled();
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("acknowledges an unrecognized status without settling or writing", async () => {
    donation_get_mock.mockResolvedValue({ id: "don-1", status: "intent" });
    const res = await deliver({
      order_id: "don-1",
      payment_id: 42,
      payment_status: "on_hold",
    });

    expect(res.status).toBe(200);
    expect(handle_settled).not.toHaveBeenCalled();
    expect(handle_confirming).not.toHaveBeenCalled();
    expect(write_on_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it("settles an underpayment in one step, flagged partial", async () => {
    const prior = { id: "don-1", status: "confirmed", currency: "ETH" };
    donation_get_mock.mockResolvedValue(prior);
    vi.mocked(handle_settled).mockResolvedValue({
      op: "settled",
      id: "don-1",
      late: false,
    });
    const payload = {
      actually_paid: 0.4,
      order_id: "don-1",
      outcome_amount: 790,
      outcome_currency: "usdc",
      pay_amount: 0.5,
      pay_currency: "eth",
      payment_id: 42,
      payment_status: "partially_paid",
    };

    const res = await deliver(payload);

    expect(res.status).toBe(200);
    expect(handle_confirming).not.toHaveBeenCalled();
    expect(handle_settled).toHaveBeenCalledWith(payload, prior);
    const [alert] = send_alert_mock.mock.calls[0];
    expect(alert.title).toMatch(/partial/i);
    expect(alert.title).not.toMatch(/late/i);
    expect(alert.body).toContain("0.4 of 0.5 ETH");
  });
});
