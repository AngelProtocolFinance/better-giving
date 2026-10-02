import { Chariot } from "@better-giving/chariot";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { amnt_sum, partition } from "@/donations/helpers";
import { snap } from "@/helpers/decimal";
import { json_ok } from "@/helpers/https";
import type { TestDb } from "$/pg/test-utils/pglite";
import type { Ctx } from "../types";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const create_grant_mock = vi.hoisted(() => vi.fn());
const capture_exception = vi.hoisted(() => vi.fn());

vi.mock("@sentry/react-router", () => ({
  captureException: capture_exception,
}));

vi.mock("$/kit/chariot", () => ({
  chariot: { create_grant: create_grant_mock },
}));
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));

const { chariot_intent } = await import("./index");
const { seed_npo } = await import("#/__tests__/fixtures/funds");
const { donation_get } = await import("$/pg/queries/donation");
const { donations, donation_donors, donation_recipients } = await import(
  "$/pg/schema/donation"
);
const { npos } = await import("$/pg/schema/npo");
const { create_test_db } = await import("$/pg/test-utils/pglite");

const db = () => test_db.current!.db;
let npo_id: number;

const ctx = (amount: Ctx["intent"]["amount"]) =>
  ({
    to: { to_id: npo_id.toString(), to_type: "npo", to_name: "ACME" },
    from: { from_email: "a@b.co" },
    donor: { email: "a@b.co" },
    via: "chariot",
    via_extra: "wfs_1",
    intent: {
      amount,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
    },
  }) as unknown as Ctx;

/** create grant through the real sdk, chariot answering `status` with `body` */
const chariot_answers = (status: number, body: unknown) => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "x-request-id": "req_1" },
    })
  );
  const sdk = new Chariot({ api_key: "k", api_url: "https://chariot.test" });
  create_grant_mock.mockImplementation((d) => sdk.create_grant(d));
};

const granted_cents = () => create_grant_mock.mock.calls[0][0].amount;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await db().delete(donation_donors);
  await db().delete(donation_recipients);
  await db().delete(donations);
  await db().delete(npos);
  npo_id = (await seed_npo(db(), { registration_number: "EIN-CHARIOT" }))!.id;
  let n = 0;
  create_grant_mock.mockImplementation(async () => {
    n++;
    return { id: `grant_${n}`, metadata: { don_id: `don_${n}` } };
  });
});

describe("chariot_intent repeat for one workflow session", () => {
  it("returns the donation already recorded for the grant instead of failing", async () => {
    // create grant is idempotent per workflow session: a repeat returns the same grant
    create_grant_mock.mockResolvedValue({
      id: "grant_1",
      metadata: { don_id: "don_1" },
    });
    const amount = { base: 10, tip: 0, fee_allowance: 0 };

    const first = await chariot_intent(ctx(amount));
    const again = await chariot_intent(ctx(amount));

    expect(again).toEqual(first);
    expect(again).toMatchObject({ don_id: "don_1" });
    expect(await db().select().from(donations)).toHaveLength(1);
  });
});

// the checkout reads a 400, 404 or 410 as "nothing exists at chariot" and lets the
// donor retry, so a 4xx may only ever answer a request that made no grant
describe("chariot_intent refusals the donor can retry", () => {
  it("refuses a base under the minimum with a 4xx the donor reads, before creating the grant", async () => {
    const res = await chariot_intent(
      ctx({ base: 0.5, tip: 0, fee_allowance: 0.5 })
    );
    await expect(json_ok(res as Response)).rejects.toMatchObject({
      status: 400,
      message: "The minimum DAF donation is 2 USD.",
    });
    expect(create_grant_mock).not.toHaveBeenCalled();
  });

  it("answers chariot's 400 with a 400 and the fallback message, never chariot's own", async () => {
    // chariot's message can be about our key or config, not the donor's gift
    chariot_answers(400, {
      timestamp: "2026-10-01T00:00:00Z",
      code: 400,
      error: "Bad Request",
      message: "Expected an API key to be provided",
    });
    const res = await chariot_intent(
      ctx({ base: 10, tip: 0, fee_allowance: 0 })
    );
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).text()).toBe(
      "Your fund couldn't make this grant. Please check the amount and try again."
    );
  });

  // a 400 can be our missing key, a 404 a wrong api url: every checkout would
  // read "check the amount" and nothing else would say so
  it("reports chariot's refusal as degraded, with its status, request id and reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    chariot_answers(400, { code: 400, message: "Expected an API key" });
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }));
    expect(capture_exception.mock.calls[0]?.[1]).toMatchObject({
      level: "warning",
      tags: { report: "degraded" },
      extra: {
        status: 400,
        request_id: "req_1",
        reason: "Expected an API key",
      },
    });
  });

  it("reports a problem body's detail as the reason when its message is blank", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    chariot_answers(400, { message: " ", detail: "Insufficient balance" });
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }));
    expect(capture_exception.mock.calls[0]?.[1]?.extra?.reason).toBe(
      "Insufficient balance"
    );
  });

  it("answers chariot's 410 for an expired session with a 410 and the fallback message, for the donor", async () => {
    chariot_answers(410, "Gone");
    const res = await chariot_intent(
      ctx({ base: 10, tip: 0, fee_allowance: 0 })
    );
    await expect(json_ok(res as Response)).rejects.toMatchObject({
      status: 410,
      message:
        "Your fund couldn't make this grant. Please check the amount and try again.",
    });
  });

  it("answers chariot's 404 for an unknown workflow session with a 404", async () => {
    chariot_answers(404, { code: 404, error: "Not Found", message: "" });
    const res = await chariot_intent(
      ctx({ base: 10, tip: 0, fee_allowance: 0 })
    );
    expect((res as Response).status).toBe(404);
    expect(await (res as Response).text()).toMatch(/couldn't make this grant/);
  });

  it("never answers chariot's 500 with a 4xx", async () => {
    chariot_answers(500, { code: 500, message: "Internal Server Error" });
    await expect(
      chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }))
    ).rejects.toThrow(/Chariot API error: 500/);
  });

  it("never answers a network failure reaching chariot with a 4xx", async () => {
    create_grant_mock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(
      chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }))
    ).rejects.toThrow("fetch failed");
  });

  // 409 is create grant already processing this session's grant: one may exist
  it("never answers chariot's 409 with a 4xx", async () => {
    chariot_answers(409, { code: 409, message: "Grant is being processed" });
    await expect(
      chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }))
    ).rejects.toThrow(/Chariot API error: 409/);
  });

  it("never answers a failed write after the grant with a 4xx", async () => {
    create_grant_mock.mockResolvedValue({
      id: "grant_x",
      metadata: { don_id: "don_x" },
    });
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }));
    // same don_id, different grant: the row isn't this grant's, so it fails
    create_grant_mock.mockResolvedValue({
      id: "grant_y",
      metadata: { don_id: "don_x" },
    });
    await expect(
      chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 0 }))
    ).rejects.toThrow();
  });
});

describe("chariot_intent grant amount", () => {
  it("refuses a total that isn't whole dollars before creating the grant", async () => {
    const res = await chariot_intent(
      ctx({ base: 10, tip: 0, fee_allowance: 0.3 })
    );
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).text()).toMatch(/whole dollar/i);
    expect(create_grant_mock).not.toHaveBeenCalled();
    expect(await db().select().from(donations)).toEqual([]);
  });

  it("refuses a total that isn't whole dollars in words the checkout shows the donor", async () => {
    const res = await chariot_intent(
      ctx({ base: 10, tip: 0, fee_allowance: 0.3 })
    );
    await expect(json_ok(res as Response)).rejects.toMatchObject({
      status: 400,
      message: "DAF grants must be a whole dollar amount",
    });
  });

  it("creates a whole-dollar total as its cents: 10 + 1 fee allowance is 1100", async () => {
    await chariot_intent(ctx({ base: 10, tip: 0, fee_allowance: 1 }));
    expect(granted_cents()).toBe(1100);
    expect(await donation_get("don_1")).toMatchObject({
      status: "intent",
      via_extra: "grant_1",
      amount: { base: 10, tip: 0, fee_allowance: 1 },
    });
  });

  it("grants every whole-dollar total whose parts carry float noise, and records that total", async () => {
    // raw `partition` output, as an older checkout bundle still posts it:
    // $10 + 15% tip + covered fee, rescaled to whatever the donor granted
    const split = partition({ base: 10, tip: 1.5, fee_allowance: 0.5 });
    const noisy = Array.from({ length: 4_998 }, (_, i) => i + 3).filter(
      (n) => amnt_sum(split(n)) !== n
    );
    expect(noisy.length).toBeGreaterThan(100);

    const mismatches: string[] = [];
    for (const n of noisy) {
      create_grant_mock.mockClear();
      await chariot_intent(ctx(split(n)));
      const granted = create_grant_mock.mock.calls[0]?.[0].amount;
      if (granted !== n * 100) mismatches.push(`granted ${n}: ${granted}`);
    }

    // the row settlement splits the grant by: its parts must add up to it
    const stored = await db().select().from(donations);
    for (const d of stored) {
      const n = noisy[Number(d.id.replace("don_", "")) - 1];
      const total = snap(d.amount_base + d.amount_tip + d.amount_fee_allowance);
      if (total !== n) mismatches.push(`stored ${n}: ${total}`);
    }
    expect(mismatches).toEqual([]);
    expect(stored).toHaveLength(noisy.length);
  });
});
