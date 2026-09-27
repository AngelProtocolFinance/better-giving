import { afterEach, describe, expect, test, vi } from "vitest";
import type { IDonDistPayload } from "@/queue";

// the hook body is the seam: queries, smtp and error reporting are the fakes.
const query_webhooks = vi.hoisted(() => vi.fn());
vi.mock("$/pg/queries/webhook", () => ({ query_webhooks }));
vi.mock("$/pg/queries/npo", () => ({ npo_get: vi.fn(async () => null) }));
vi.mock("$/pg/queries/country", () => ({
  country_metrics_time_get: vi.fn(),
  country_time_update: vi.fn(),
  country_update: vi.fn(),
}));
vi.mock("$/pg/queries/user", () => ({ npo_admins: vi.fn(async () => []) }));
const send_email = vi.hoisted(() => vi.fn(async (_: any) => ({})));
vi.mock("$/email", () => ({ send_email }));
const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

import { handle_don_dist } from "./handle-don-dist";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const eur_gift: IDonDistPayload = {
  id: "don-1",
  date_created: "2026-09-20T10:00:00.000Z",
  amount: 100,
  amount_usd: 108.5,
  amount_denom: "EUR",
  frequency: "one-time",
  via: "stripe:card",
  source: "bg-marketplace",
  to_id: 42,
  to_name: "Save the Whales",
  net: 105,
  sttl_date: "2026-09-21T10:00:00.000Z",
  from_email: "ada@test.com",
  from: { name: "Ada Lovelace" },
};

describe("handle_don_dist webhooks", () => {
  test("a non-USD gift reaches the hook in its own currency", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.test/1" },
    ]);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await handle_don_dist({} as never, eur_gift);

    expect(fetch_spy).toHaveBeenCalledOnce();
    const [url, init] = fetch_spy.mock.calls[0];
    expect(url).toBe("https://hooks.zapier.test/1");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ amount: 100, currency: "EUR" });
  });

  test("a hook whose fetch throws doesn't stop the next one", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-dead", npo_id: 42, url: "https://dead.test/1" },
      { id: "hook-live", npo_id: 42, url: "https://hooks.zapier.test/2" },
    ]);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (url === "https://dead.test/1") throw new TypeError("fetch failed");
        return new Response("ok", { status: 200 });
      });

    await handle_don_dist({} as never, eur_gift);

    expect(fetch_spy.mock.calls.map(([url]) => url)).toContain(
      "https://hooks.zapier.test/2"
    );
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error.mock.calls[0]![1]).toEqual({
      webhook_id: "hook-dead",
      npo_id: 42,
    });
  });

  test("a hook that never answers is cut off by its timeout", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-hang", npo_id: 42, url: "https://hang.test/1" },
      { id: "hook-live", npo_id: 42, url: "https://hooks.zapier.test/2" },
    ]);
    // the timeout signal is the clock: firing it by hand keeps the test off real time
    const clock = new AbortController();
    const timeout_spy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(clock.signal);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        if (url !== "https://hang.test/1") {
          return new Response("ok", { status: 200 });
        }
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal!.reason)
          );
        });
      });

    const run = handle_don_dist({} as never, eur_gift);
    await vi.waitFor(() => expect(fetch_spy).toHaveBeenCalledTimes(2));
    clock.abort(new DOMException("timed out", "TimeoutError"));
    await run;

    expect(fetch_spy.mock.calls.map(([url]) => url)).toContain(
      "https://hooks.zapier.test/2"
    );
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error.mock.calls[0]![1]).toEqual({
      webhook_id: "hook-hang",
      npo_id: 42,
    });
    expect(timeout_spy.mock.calls).toEqual([[10_000], [10_000]]);
  });

  test("a 2xx is delivered even if its response body never arrives", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.test/1" },
    ]);
    const broken_body = new ReadableStream({
      start: (c) => c.error(new Error("connection reset")),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(broken_body, { status: 200 })
    );

    await handle_don_dist({} as never, eur_gift);

    expect(report_error).not.toHaveBeenCalled();
  });

  test("a failed hook's report quotes at most 200 chars of its body", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.test/1" },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("x".repeat(5_000), { status: 502 })
    );

    await handle_don_dist({} as never, eur_gift);

    const [err] = report_error.mock.calls[0]!;
    expect(err.message).toContain("x".repeat(200));
    expect(err.message).not.toContain("x".repeat(201));
  });
});

describe("handle_don_dist npo notification", () => {
  test("dates the donation in the pretty-utc form the template prints", async () => {
    query_webhooks.mockResolvedValue([]);

    await handle_don_dist({} as never, eur_gift);

    expect(send_email).toHaveBeenCalledOnce();
    const { node } = send_email.mock.calls[0]![0];
    expect(node.props.date).toBe("2026-09-21 10:00:00 (UTC)");
  });
});
