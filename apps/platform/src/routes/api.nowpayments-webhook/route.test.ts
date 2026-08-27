import { beforeEach, describe, expect, it, vi } from "vitest";

const capture_exception_mock = vi.hoisted(() => vi.fn());
const donation_update_mock = vi.hoisted(() => vi.fn());

// node:crypto is externalized in vitest's browser environment, so the route's
// hmac gets a deterministic stand-in: signing stays a pure function of secret +
// the payload the route feeds it, which is all the verify/dispatch path reads.
const fake_digest = vi.hoisted(
  () => (secret: string, data: string) => `${secret}:${data}`
);

vi.mock("node:crypto", () => ({
  default: {
    createHmac: (_algo: string, secret: string) => {
      let data = "";
      return {
        update: (chunk: string) => {
          data += chunk;
        },
        digest: () => fake_digest(secret, data),
      };
    },
  },
}));
vi.mock("@sentry/react-router", () => ({
  captureException: capture_exception_mock,
}));
vi.mock("$/env", () => ({
  nowpayments: { ipn_secret: "ipn-secret" },
  stage: "test",
}));
vi.mock("$/kit/discord", () => ({
  aws_monitor: { send_alert: vi.fn() },
}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_update: donation_update_mock,
}));
vi.mock("./handlers/confirming", () => ({ handle_confirming: vi.fn() }));
vi.mock("./handlers/failed", () => ({ handle_failed: vi.fn() }));
vi.mock("./handlers/settled", () => ({ handle_settled: vi.fn() }));

const { action } = await import("./route");

const post = (body: string, headers: Record<string, string> = {}): Request =>
  new Request("https://x/api/nowpayments-webhook", {
    method: "POST",
    body,
    headers,
  });

const invoke = async (request: Request): Promise<Response> =>
  (await action({ request } as any)) as Response;

// mirrors the route: keys sorted before hashing, so a payload posted in any
// order signs the same
const sign = (payload: Record<string, unknown>): string => {
  const sorted: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    sorted[k] = v;
  }
  return fake_digest("ipn-secret", JSON.stringify(sorted));
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
    expect(donation_update_mock).not.toHaveBeenCalled();
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });

  it("dispatches a payload whose signature verifies", async () => {
    donation_update_mock.mockResolvedValue({ id: "don-1", status: "pending" });
    const payload = {
      payment_status: "waiting",
      order_id: "don-1",
      payment_id: 42,
    };

    const res = await invoke(
      post(JSON.stringify(payload), { "x-nowpayments-sig": sign(payload) })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: "don-1",
      status: "pending",
    });
    expect(donation_update_mock).toHaveBeenCalledWith({}, "don-1", {
      via_extra: "42",
    });
    expect(capture_exception_mock).not.toHaveBeenCalled();
  });
});
