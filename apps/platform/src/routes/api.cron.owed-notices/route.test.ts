import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { IMsg } from "@/queue";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));
const terms = vi.hoisted(() => ({ effective: null as string | null }));
vi.mock("$/env", async (io) => ({
  ...(await io<typeof import("$/env")>()),
  get owed_terms_effective() {
    return terms.effective;
  },
}));
const enqueue = vi.hoisted(() => vi.fn(async (..._: IMsg[]) => {}));
vi.mock("$/kit/queue", () => ({ verify_qstash: vi.fn(), enqueue }));

import { seed_npo } from "#/__tests__/fixtures/funds";
import type { DbOrTx } from "$/pg/queries/helpers";
import { owed_list, record_owed } from "$/pg/queries/owed";
import { owed_notices_due } from "$/pg/queries/owed-notice";
import { donations } from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import { owed_amounts } from "$/pg/schema/owed";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action } from "./route";

const db = () => test_db.current!.db;
const as_db = (x: unknown) => x as DbOrTx;

const EFFECTIVE = "2026-11-01T00:00:00.000Z";
const NOW = "2026-11-20T12:00:00.000Z";

let npo_id: number;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  terms.effective = EFFECTIVE;
  enqueue.mockClear();
  await db().delete(owed_amounts);
  await db().delete(donations);
  await db().delete(npos);
  npo_id = (await seed_npo(db(), { registration_number: "EIN-A" }))!.id;
});

const refunded_gift = async (id: string, created_at: string) => {
  await db().insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
    created_at,
  });
  await record_owed(as_db(db()), {
    donation_id: id,
    party: { npo_id },
    source: "refund",
    source_ref: `re_${id}`,
    received_usd: 90,
    fee_processing_usd: 3.2,
    now: NOW,
  });
};

const tick = () =>
  action({
    request: new Request("https://bg.test/api/cron/owed-notices", {
      method: "POST",
    }),
  } as any) as Promise<Response>;

const enqueued = () => enqueue.mock.calls.flat();

describe("api.cron.owed-notices", () => {
  test("enqueues each due notice under its own id, so a second tick is the same message", async () => {
    await refunded_gift("don-1", EFFECTIVE);
    await refunded_gift("don-2", EFFECTIVE);
    const ids = (await owed_notices_due(50, as_db(db()))).map((n) => n.id);

    expect((await tick()).status).toBe(200);
    await tick();

    expect(enqueued().map((m) => [m.id, m.payload, m.dedupe])).toEqual(
      [...ids, ...ids].map((id) => ["owed-notice", { id }, `owed.notice_${id}`])
    );
  });

  test("a gift made before the effective date, or any while it is unset, queues nothing, and the admin list still has it", async () => {
    await refunded_gift("don-before", "2026-10-31T23:59:59.000Z");
    terms.effective = null;
    await refunded_gift("don-on", EFFECTIVE);

    await tick();

    expect(enqueued()).toEqual([]);
    const admin = await owed_list({ sort: "date", dir: "desc" }, as_db(db()));
    expect(admin.items.map((r) => r.donation_id).sort()).toEqual([
      "don-before",
      "don-on",
    ]);
  });
});
