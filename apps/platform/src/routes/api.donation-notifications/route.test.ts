import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send_email_mock = vi.hoisted(() => vi.fn());
const get_session_mock = vi.hoisted(() => vi.fn());
const to_fn_mock = vi.hoisted(() => vi.fn());
const template_mock = vi.hoisted(() =>
  vi.fn((_d: any) => ({ node: null, subject: "transfer notif" }))
);

vi.mock("emails", () => ({
  donation_transfer_notif: { template: template_mock },
}));
vi.mock("#/.server/auth", () => ({ get_session: get_session_mock }));
vi.mock("#/.server/donation-recipient", () => ({ to_fn: to_fn_mock }));
vi.mock("$/email", () => ({ send_email: send_email_mock }));
vi.mock("$/env", () => ({ base_url: "https://bg.test" }));
vi.mock("@/errors/report", () => ({ report_null: vi.fn() }));

const { action, seen } = await import("./route");

const DEDUP_TTL = 5 * 60 * 1000;
const NPO_ID = "42";
const FUND_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";

const notif = (ticker: string, recipient_id = NPO_ID) => ({
  type: "stocks",
  recipient_id,
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
  template_mock.mockReturnValue({ node: null, subject: "transfer notif" });
  seen.clear();
  now = 1_700_000_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  get_session_mock.mockResolvedValue({ user: { email: "a@b.co" } });
  send_email_mock.mockResolvedValue(undefined);
  to_fn_mock.mockResolvedValue({
    to_id: NPO_ID,
    to_type: "npo",
    to_name: "Freegan Food Foundation",
    to_tip_allowed: true,
    to_members: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api.donation-notifications recipient identity", () => {
  it("names the recipient from the record, not from the caller", async () => {
    await invoke(
      post({
        ...notif("AAPL"),
        // an unauthenticated caller reaches four internal inboxes here, so a
        // name it supplies is a recipient it invented
        recipient_name: "Totally Real Charity",
        recipient_url: "https://phish.invalid/pay",
      })
    );

    expect(template_mock).toHaveBeenCalledOnce();
    const d = template_mock.mock.calls[0]![0] as any;
    expect(d.recipient_name).toBe("Freegan Food Foundation");
    expect(d.recipient_url).toBe(`https://bg.test/marketplace/${NPO_ID}`);
  });

  it("links a fund recipient to its own page", async () => {
    to_fn_mock.mockResolvedValue({
      to_id: FUND_ID,
      to_type: "fund",
      to_name: "Ocean Fund",
      to_tip_allowed: true,
      to_members: ["1"],
    });

    await invoke(post(notif("AAPL", FUND_ID)));

    const d = template_mock.mock.calls[0]![0] as any;
    expect(d.recipient_url).toBe(`https://bg.test/fundraisers/${FUND_ID}`);
  });

  it("mails nobody when the id names no live recipient", async () => {
    // to_fn also refuses a deactivated npo, so this is the same answer for an
    // id that never existed and one that is no longer receiving
    to_fn_mock.mockResolvedValue(undefined);

    const res = await invoke(post(notif("AAPL")));

    expect(res.status).toBe(400);
    expect(send_email_mock).not.toHaveBeenCalled();
  });

  it("rejects a payload carrying no recipient id at all", async () => {
    const res = await invoke(
      post({
        type: "stocks",
        recipient_name: "ACME",
        recipient_url: "https://phish.invalid",
        details: { ticker: "AAPL", shares: "10", amount: "100" },
      })
    );

    expect(res.status).toBe(400);
    expect(to_fn_mock).not.toHaveBeenCalled();
    expect(send_email_mock).not.toHaveBeenCalled();
  });
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
