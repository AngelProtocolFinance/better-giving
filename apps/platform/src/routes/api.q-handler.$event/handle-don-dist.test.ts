import { afterEach, describe, expect, test, vi } from "vitest";
import type { IDonDistPayload } from "@/queue";

// the hook body is the seam: queries, smtp and error reporting are the fakes.
const query_webhooks = vi.hoisted(() => vi.fn());
const delete_webhook = vi.hoisted(() => vi.fn());
vi.mock("$/pg/queries/webhook", () => ({ query_webhooks, delete_webhook }));
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
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.com/hooks/1" },
    ]);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await handle_don_dist({} as never, eur_gift);

    expect(fetch_spy).toHaveBeenCalledOnce();
    const [url, init] = fetch_spy.mock.calls[0];
    expect(url).toBe("https://hooks.zapier.com/hooks/1");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ amount: 100, currency: "EUR" });
  });

  test("a hook whose fetch throws doesn't stop the next one", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-dead", npo_id: 42, url: "https://hooks.zapier.com/dead" },
      { id: "hook-live", npo_id: 42, url: "https://hooks.zapier.com/hooks/2" },
    ]);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        if (url === "https://hooks.zapier.com/dead")
          throw new TypeError("fetch failed");
        return new Response("ok", { status: 200 });
      });

    await handle_don_dist({} as never, eur_gift);

    expect(fetch_spy.mock.calls.map(([url]) => url)).toContain(
      "https://hooks.zapier.com/hooks/2"
    );
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error.mock.calls[0]![1]).toEqual({
      webhook_id: "hook-dead",
      npo_id: 42,
    });
  });

  test("a hook that never answers is cut off by its timeout", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-hang", npo_id: 42, url: "https://hooks.zapier.com/hang" },
      { id: "hook-live", npo_id: 42, url: "https://hooks.zapier.com/hooks/2" },
    ]);
    // the timeout signal is the clock: firing it by hand keeps the test off real time
    const clock = new AbortController();
    const timeout_spy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(clock.signal);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        if (url !== "https://hooks.zapier.com/hang") {
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
      "https://hooks.zapier.com/hooks/2"
    );
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error.mock.calls[0]![1]).toEqual({
      webhook_id: "hook-hang",
      npo_id: 42,
    });
    expect(timeout_spy.mock.calls).toEqual([[10_000], [10_000]]);
  });

  test("a 2xx's body is cancelled without waiting for it to arrive", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.com/hooks/1" },
    ]);
    const cancel = vi.fn();
    const stalled_body = new ReadableStream({ cancel });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stalled_body, { status: 200 })
    );

    await handle_don_dist({} as never, eur_gift);

    expect(cancel).toHaveBeenCalledOnce();
    expect(report_error).not.toHaveBeenCalled();
  });

  test("a 2xx is delivered even if its response body errors", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.com/hooks/1" },
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

  test("a failed hook is reported by id and status, never its body", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.com/hooks/1" },
    ]);
    const cancel = vi.fn();
    const echoing_body = new ReadableStream({
      start: (c) => c.enqueue(new TextEncoder().encode("ada@test.com echoed")),
      cancel,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(echoing_body, { status: 502 })
    );

    await handle_don_dist({} as never, eur_gift);

    expect(report_error).toHaveBeenCalledOnce();
    const [err, context] = report_error.mock.calls[0]!;
    expect(err.message).toBe("webhook hook-1 -> 502");
    expect(context).toEqual({ webhook_id: "hook-1", npo_id: 42, status: 502 });
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("a hook that redirects is not followed and is reported", async () => {
    const { createServer } = await import("node:http");
    const hits: string[] = [];
    const server = createServer((req, res) => {
      hits.push(req.url!);
      if (req.url === "/hook") {
        res.writeHead(302, { location: "/internal" }).end();
      } else res.writeHead(200).end();
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const { port } = server.address() as { port: number };
    query_webhooks.mockResolvedValue([
      { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.com/hook" },
    ]);
    // real fetch, with zapier's origin pointed at the local server
    const real_fetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) =>
      real_fetch(
        String(url).replace(
          "https://hooks.zapier.com",
          `http://127.0.0.1:${port}`
        ),
        init
      )
    );

    await handle_don_dist({} as never, eur_gift).finally(() => server.close());

    expect(hits).toEqual(["/hook"]);
    expect(report_error.mock.calls[0]![1]).toEqual({
      webhook_id: "hook-1",
      npo_id: 42,
      status: 302,
    });
  });

  test("a stored url off zapier is never posted to: its row is deleted and reported by id", async () => {
    query_webhooks.mockResolvedValue([
      { id: "hook-evil", npo_id: 42, url: "http://169.254.169.254/x" },
      { id: "hook-live", npo_id: 42, url: "https://hooks.zapier.com/hooks/2" },
    ]);
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await handle_don_dist({} as never, eur_gift);

    expect(fetch_spy.mock.calls.map(([url]) => url)).toEqual([
      "https://hooks.zapier.com/hooks/2",
    ]);
    expect(delete_webhook).toHaveBeenCalledExactlyOnceWith("hook-evil", 42);
    expect(report_error).toHaveBeenCalledOnce();
    const [err, context] = report_error.mock.calls[0]!;
    expect(context).toEqual({ webhook_id: "hook-evil", npo_id: 42 });
    expect(err.message).not.toContain("169.254");
  });
});

describe("handle_don_dist hook status", () => {
  const two_hooks = [
    { id: "hook-a", npo_id: 42, url: "https://hooks.zapier.com/hooks/a" },
    { id: "hook-b", npo_id: 42, url: "https://hooks.zapier.com/hooks/b" },
  ];
  const answer_a_with = (status: number) =>
    vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) =>
        url === "https://hooks.zapier.com/hooks/a"
          ? new Response("", { status })
          : new Response("ok", { status: 200 })
      );

  test("a 410 unsubscribes that hook and reports nothing", async () => {
    query_webhooks.mockResolvedValue(two_hooks);
    answer_a_with(410);

    await handle_don_dist({} as never, eur_gift);

    expect(delete_webhook).toHaveBeenCalledOnce();
    expect(delete_webhook).toHaveBeenCalledWith("hook-a", 42);
    expect(report_error).not.toHaveBeenCalled();
  });

  test("a 410's body is cancelled", async () => {
    query_webhooks.mockResolvedValue(two_hooks.slice(0, 1));
    const cancel = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new ReadableStream({ cancel }), { status: 410 })
    );

    await handle_don_dist({} as never, eur_gift);

    expect(cancel).toHaveBeenCalledOnce();
  });

  test("a 410 whose unsubscribe fails is reported once, without the url", async () => {
    query_webhooks.mockResolvedValue(two_hooks);
    answer_a_with(410);
    delete_webhook.mockRejectedValueOnce(new Error("db unavailable"));

    await handle_don_dist({} as never, eur_gift);

    expect(report_error).toHaveBeenCalledOnce();
    const [err, context] = report_error.mock.calls[0]!;
    expect(context).toEqual({ webhook_id: "hook-a", npo_id: 42 });
    expect(err.message).not.toContain("hooks.zapier.com");
  });

  test("a 500 keeps that hook subscribed and is reported", async () => {
    query_webhooks.mockResolvedValue(two_hooks);
    answer_a_with(500);

    await handle_don_dist({} as never, eur_gift);

    expect(delete_webhook).not.toHaveBeenCalled();
    expect(report_error).toHaveBeenCalledOnce();
    const [err, context] = report_error.mock.calls[0]!;
    expect(context).toEqual({ webhook_id: "hook-a", npo_id: 42, status: 500 });
    expect(err.message).not.toContain("hooks.zapier.com");
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
