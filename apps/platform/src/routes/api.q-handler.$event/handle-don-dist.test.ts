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
vi.mock("$/email", () => ({ send_email: vi.fn(async () => ({})) }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

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
});
