import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { IDonDistPayload } from "@/queue";
import type { TestDb } from "$/pg/test-utils/pglite";

// the hook body is the seam: the dist row (the notice lease) is real pglite;
// the other queries, smtp and error reporting are the fakes.
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));
const query_webhooks = vi.hoisted(() => vi.fn());
const delete_webhook = vi.hoisted(() => vi.fn());
vi.mock("$/pg/queries/webhook", () => ({ query_webhooks, delete_webhook }));
const npo_get = vi.hoisted(() =>
  vi.fn(async (_: number): Promise<any> => null)
);
vi.mock("$/pg/queries/npo", () => ({ npo_get }));
const country = vi.hoisted(() => ({
  country_metrics_time_get: vi.fn(async (): Promise<number | null> => null),
  country_time_update: vi.fn(),
  country_update: vi.fn(),
}));
vi.mock("$/pg/queries/country", () => country);
vi.mock("$/pg/queries/user", () => ({ npo_admins: vi.fn(async () => []) }));
const send_email = vi.hoisted(() => vi.fn(async (_: any) => ({})));
vi.mock("$/email", () => ({
  send_email,
  send_email_or_throw: send_email,
}));
const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

import { eq } from "drizzle-orm";
import { db as app_db } from "$/pg/db";
import { dists } from "$/pg/schema/dist";
import { donations } from "$/pg/schema/donation";
import { create_test_db } from "$/pg/test-utils/pglite";
import { handle_don_dist } from "./handle-don-dist";

const db = () => test_db.current!.db;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

// the payload's `id` is its dist row's id
beforeEach(async () => {
  await db().delete(dists);
  await db().delete(donations);
  await db().insert(donations).values({
    id: "don-1",
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "EUR",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db().insert(dists).values({
    id: "don-1",
    donation_id: "don-1",
    status: "settled",
    date_created: "2026-09-20T10:00:00.000Z",
    amount_denom: "EUR",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  npo_get.mockResolvedValue(null);
  country.country_metrics_time_get.mockResolvedValue(null);
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

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift);

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

    const run = handle_don_dist(app_db, eur_gift);
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

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift).finally(() => server.close());

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

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift);

    expect(cancel).toHaveBeenCalledOnce();
  });

  test("a 410 whose unsubscribe fails is reported once, without the url", async () => {
    query_webhooks.mockResolvedValue(two_hooks);
    answer_a_with(410);
    delete_webhook.mockRejectedValueOnce(new Error("db unavailable"));

    await handle_don_dist(app_db, eur_gift);

    expect(report_error).toHaveBeenCalledOnce();
    const [err, context] = report_error.mock.calls[0]!;
    expect(context).toEqual({ webhook_id: "hook-a", npo_id: 42 });
    expect(err.message).not.toContain("hooks.zapier.com");
  });

  test("a 500 keeps that hook subscribed and is reported", async () => {
    query_webhooks.mockResolvedValue(two_hooks);
    answer_a_with(500);

    await handle_don_dist(app_db, eur_gift);

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

    await handle_don_dist(app_db, eur_gift);

    expect(send_email).toHaveBeenCalledOnce();
    const { node } = send_email.mock.calls[0]![0];
    expect(node.props.date).toBe("2026-09-21 10:00:00 (UTC)");
  });
});

describe("handle_don_dist redelivery", () => {
  const one_hook = [
    { id: "hook-1", npo_id: 42, url: "https://hooks.zapier.com/hooks/1" },
  ];
  const with_metrics = () => {
    npo_get.mockResolvedValue({ hq_country: "Philippines" });
    country.country_metrics_time_get.mockResolvedValue(2638);
  };

  test("the same message handled twice counts, posts and mails once", async () => {
    query_webhooks.mockResolvedValue(one_hook);
    with_metrics();
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("ok", { status: 200 }));

    await handle_don_dist(app_db, eur_gift);
    await handle_don_dist(app_db, eur_gift);

    expect(country.country_update).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({ country_key: "philippines", inc_amount: 105 })
    );
    expect(fetch_spy.mock.calls.map(([url]) => url)).toEqual([
      "https://hooks.zapier.com/hooks/1",
    ]);
    expect(send_email).toHaveBeenCalledOnce();
  });

  test("a refused npo mail gives the notice back, and the redelivery runs it once", async () => {
    query_webhooks.mockResolvedValue(one_hook);
    with_metrics();
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("ok", { status: 200 }));
    const refusal = new Error("550 mailbox unavailable");
    send_email.mockRejectedValueOnce(refusal);

    await expect(handle_don_dist(app_db, eur_gift)).rejects.toBe(refusal);
    expect(fetch_spy).not.toHaveBeenCalled();
    expect(country.country_update).not.toHaveBeenCalled();

    await handle_don_dist(app_db, eur_gift);
    await handle_don_dist(app_db, eur_gift);

    expect(send_email).toHaveBeenCalledTimes(2);
    expect(fetch_spy).toHaveBeenCalledOnce();
    expect(country.country_update).toHaveBeenCalledOnce();
  });

  test("a dist refunded before its notice runs mails, counts and posts nothing", async () => {
    query_webhooks.mockResolvedValue(one_hook);
    with_metrics();
    const fetch_spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("ok", { status: 200 }));
    await db()
      .update(dists)
      .set({ status: "refunded" })
      .where(eq(dists.id, "don-1"));

    await handle_don_dist(app_db, eur_gift);

    expect(send_email).not.toHaveBeenCalled();
    expect(country.country_update).not.toHaveBeenCalled();
    expect(fetch_spy).not.toHaveBeenCalled();
  });
});
