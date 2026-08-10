import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send_email_mock = vi.hoisted(() => vi.fn());
const get_session_mock = vi.hoisted(() => vi.fn());

vi.mock("emails", () => ({
  donation_transfer_notif: {
    template: () => ({ node: null, subject: "transfer notif" }),
  },
}));
vi.mock("#/.server/auth", () => ({ get_session: get_session_mock }));
vi.mock("$/email", () => ({ send_email: send_email_mock }));
vi.mock("@/errors/report", () => ({ report_null: vi.fn() }));

const { action, seen } = await import("./route");

const DEDUP_TTL = 5 * 60 * 1000;

const notif = (ticker: string) => ({
  type: "stocks",
  recipient_name: "ACME",
  recipient_url: "https://x/acme",
  details: { ticker, shares: "10", amount: "100" },
});

const post = (body: unknown): Request =>
  new Request("https://x/api/donation-notifications", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const invoke = async (request: Request): Promise<Response> =>
  (await action({ request } as any)) as Response;

let now = 0;

beforeEach(() => {
  vi.clearAllMocks();
  seen.clear();
  now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  get_session_mock.mockResolvedValue({ user: { email: "a@b.co" } });
  send_email_mock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api.donation-notifications dedup guard", () => {
  it("drops entries past the window when a later notification is admitted", async () => {
    await invoke(post(notif("AAPL")));
    const stale_key = [...seen.keys()][0]!;

    now += DEDUP_TTL + 1;
    await invoke(post(notif("MSFT")));

    expect(seen.has(stale_key)).toBe(false);
    expect(seen.size).toBe(1);
  });

  it("re-admits the same notification once its window has passed", async () => {
    await invoke(post(notif("AAPL")));

    now += DEDUP_TTL + 1;
    const second = await invoke(post(notif("AAPL")));

    expect(send_email_mock).toHaveBeenCalledTimes(2);
    expect(second.status).toBe(200);
  });

  it("still suppresses a repeat within the window on the same instance", async () => {
    const first = await invoke(post(notif("AAPL")));

    now += 60_000;
    const second = await invoke(post(notif("AAPL")));

    expect(send_email_mock).toHaveBeenCalledOnce();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
