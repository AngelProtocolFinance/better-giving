import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { lock_order, logged_db } from "#/__tests__/fixtures/locks";
import type { IInput, IParts } from "@/types/donation-dist";
import type { DbOrTx } from "../pg/queries/helpers";
import * as schema from "../pg/schema";
import { bal_txs } from "../pg/schema/bal-tx";
import { dists } from "../pg/schema/dist";
import { donation_donors, donations } from "../pg/schema/donation";
import { donation_messages } from "../pg/schema/donation-message";
import { nav_logs } from "../pg/schema/nav";
import { npos } from "../pg/schema/npo";
import { payouts } from "../pg/schema/payout";
import { programs } from "../pg/schema/program";
import { rev_logs } from "../pg/schema/revenue";
import { create_test_db, type TestDb } from "../pg/test-utils/pglite";

const flags = vi.hoisted(() => ({ routing: true }));
const holder = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));
// the read surfaces query the module db
// the zapier key is the npo id; the route's own mapping and query run for real
vi.mock("#/routes/_helpers/validate-api-key", () => ({
  validate_api_key: async (key: string | null) => ({ npo_id: Number(key) }),
  is_response: (x: unknown) => x instanceof Response,
}));
vi.mock("../pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        const real = holder.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));
vi.mock("../env", async (importOriginal) => {
  const real = await importOriginal<typeof import("../env")>();
  return {
    ...real,
    stripe: {
      ...real.stripe,
      get connect_routing() {
        return flags.routing;
      },
    },
  };
});

const { settle_npo, settle_unrouted } = await import("./settle-npo");
const { preview_settlement } = await import("./preview");
const { npo_donations } = await import("../pg/queries/dist");
const { donation_message_list } = await import(
  "../pg/queries/donation-message"
);
const { npo_donor_list } = await import("../pg/queries/donor");
const { npo_program_get } = await import("../pg/queries/program");
const { loader: zapier_samples } = await import(
  "#/routes/api.zapier.triggers.new-donation"
);

const db = () => holder.current!.db;

beforeAll(async () => {
  holder.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await holder.current?.client.close();
});

describe("settle_npo", () => {
  // the plan's bal_begin/bal_end come from this read: unlocked, two concurrent
  // settlements of one npo both plan from the same balance
  test("issues its npo read with for no key update", async () => {
    // pglite is one connection: this pins the sql text, not that a second writer blocks
    // an inactive npo returns right after the read, so no full input is needed
    const npo = await seed_npo(db(), { active: false });
    const queries: string[] = [];
    const logged = drizzle(holder.current!.client, {
      schema,
      logger: { logQuery: (q) => queries.push(q) },
    });
    const input = { id: npo!.id, prnt: { id: "no-such-donation" } } as IInput;

    await logged.transaction((tx) =>
      settle_npo(tx as unknown as DbOrTx, input)
    );

    const npo_read = queries.find((q) => /from "npos"/.test(q));
    expect(npo_read).toMatch(/for no key update/);
  });
});

const ACCT = "acct_settle_routed";
const DON_ID = "don-routed-1";

const amt = (base: number, tip = 0, fee_allowance = 0) => ({
  base,
  tip,
  fee_allowance,
});

const parts = (): IParts => ({
  amnt: amt(100, 10),
  amnt_usd: amt(100, 10),
  fa: amt(0),
  sttl: amt(100, 10),
  sttl_fee: amt(0),
  sttl_fa: amt(0),
});

const make_input = (
  npo_id: number,
  via = "stripe:card",
  don_id = DON_ID
): IInput => ({
  id: npo_id,
  ps: parts(),
  sttl: {
    id: "pi_routed_1",
    date: "2026-01-01T00:00:00.000Z",
    currency: "USD",
  },
  prnt: {
    id: don_id,
    to_id: String(npo_id),
    to_name: "Routed NPO",
    to_members: [],
    type: "npo",
  },
  source: undefined,
  program: undefined,
  nav_price: 1,
  tx: {
    currency: "USD",
    upusd: 1,
    frequency: "one-time",
    status: "settled",
    source: "bg-marketplace",
    via,
    from_email: "d@e.com",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
});

/** ready, unsponsored, in a transfer country; stored split invests half */
const ROUTABLE = {
  name: "Routed NPO",
  hq_country: "United States",
  allocation: { cash: 50, liq: 30, lock: 20 },
  stripe_account_id: ACCT,
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_details_submitted: true,
  stripe_requirements_due: [],
} satisfies Partial<typeof npos.$inferInsert>;

async function seed_donation(via = "stripe:card", id = DON_ID) {
  await db().insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 10,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via,
  });
}

const settle = (i: IInput) =>
  db().transaction((tx) => settle_npo(tx as unknown as DbOrTx, i));

const dist_of = async () => {
  const [d] = await db()
    .select()
    .from(dists)
    .where(eq(dists.donation_id, DON_ID));
  return d!;
};

describe("settle_npo on a card donation to a connected npo", () => {
  beforeEach(async () => {
    flags.routing = true;
    await db().delete(payouts);
    await db().delete(bal_txs);
    await db().delete(rev_logs);
    await db().delete(dists);
    await db().delete(donation_messages);
    await db().delete(donation_donors);
    await db().delete(donations);
    await db().delete(programs);
    await db().delete(npos);
  });

  test("writes the dist routed to its account, and no payout, balance or investment", async () => {
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      registration_number: "EIN-ROUTED-1",
    });
    await seed_donation();

    await settle(make_input(npo!.id));

    const dist = await dist_of();
    expect(dist).toMatchObject({
      stripe_routed_to: ACCT,
      stripe_transfer_id: null,
      net: 100,
      alloc: { cash: 100, liq: 0, lock: 0 },
    });
    expect(await db().select().from(payouts)).toEqual([]);
    expect(await db().select().from(bal_txs)).toEqual([]);
    expect(await db().select().from(nav_logs)).toEqual([]);
    const [after] = await db().select().from(npos).where(eq(npos.id, npo!.id));
    expect({
      cash: after!.cash,
      liq: after!.liq,
      lock: after!.lock_units,
    }).toEqual({ cash: 0, liq: 0, lock: 0 });
    // the tip is bg's whichever way the net goes
    const logs = await db().select().from(rev_logs);
    expect(logs.map((l) => [l.type, l.gross])).toEqual([["tip", 10]]);
  });

  test.each<[string, Partial<typeof npos.$inferInsert>, string, boolean]>([
    // a cheque or daf gift never reached our stripe balance to transfer from
    ["a non-stripe rail", {}, "daf", true],
    ["the switch off", {}, "stripe:card", false],
    // outside the transfer countries
    ["an ineligible npo", { hq_country: "Philippines" }, "stripe:card", true],
    [
      "an npo that disconnected us",
      { stripe_deauthorized_at: "2026-10-01T00:00:00.000Z" },
      "stripe:card",
      true,
    ],
  ])("settles pooled for %s", async (_case, patch, via, routing) => {
    flags.routing = routing;
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      allocation: { cash: 100, liq: 0, lock: 0 },
      registration_number: "EIN-POOLED-1",
      ...patch,
    });
    await seed_donation(via);

    await settle(make_input(npo!.id, via));

    expect((await dist_of()).stripe_routed_to).toBeNull();
    const [payout] = await db().select().from(payouts);
    expect(payout?.amount).toBe(100);
  });

  // the order `dists_locked` in refund/share.ts documents: a refund-failed
  // credit holds the donation while it waits on the dist
  test("a refused transfer's rebook locks the donation, then the dist, then the npo", async () => {
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      allocation: { cash: 100, liq: 0, lock: 0 },
      registration_number: "EIN-ROUTED-LOCKS",
    });
    await seed_donation();
    await settle(make_input(npo!.id));
    const dist = await dist_of();
    const { db: logged, queries } = logged_db(holder.current!);

    const r = await logged.transaction((tx) =>
      settle_unrouted(tx as unknown as DbOrTx, {
        id: dist.id,
        donation_id: DON_ID,
        to_id: npo!.id,
        net: 100,
        settled_net: 100,
        refunds_cut_share: null,
        date_created: dist.date_created,
      })
    );

    expect(r.status).toBe("booked");
    expect(await dist_of()).toMatchObject({ settled_net: null });
    expect(lock_order(queries, ["donations", "dists", "npos"])).toEqual([
      "donations",
      "dists",
      "npos",
    ]);
  });

  test("a partial cut books and stores the remainder", async () => {
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      allocation: { cash: 100, liq: 0, lock: 0 },
      registration_number: "EIN-ROUTED-CUT",
    });
    await seed_donation();
    await settle(make_input(npo!.id));
    const dist = await dist_of();

    const r = await db().transaction((tx) =>
      settle_unrouted(tx as unknown as DbOrTx, {
        id: dist.id,
        donation_id: DON_ID,
        to_id: npo!.id,
        net: 75,
        settled_net: 100,
        refunds_cut_share: 0.25,
        date_created: dist.date_created,
      })
    );

    expect(r.status).toBe("booked");
    expect(await dist_of()).toMatchObject({
      net: 75,
      refunds_cut_share: 0.25,
      settled_net: 100,
    });
    const [payout] = await db().select().from(payouts);
    expect(payout?.amount).toBe(75);
  });

  test("a total cut books nothing and keeps the settled net", async () => {
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      allocation: { cash: 100, liq: 0, lock: 0 },
      registration_number: "EIN-ROUTED-CUT-ALL",
    });
    await seed_donation();
    await settle(make_input(npo!.id));
    const dist = await dist_of();

    const r = await db().transaction((tx) =>
      settle_unrouted(tx as unknown as DbOrTx, {
        id: dist.id,
        donation_id: DON_ID,
        to_id: npo!.id,
        net: 0,
        settled_net: 100,
        refunds_cut_share: 1,
        date_created: dist.date_created,
      })
    );

    expect(r.status).toBe("booked");
    expect(await dist_of()).toMatchObject({
      net: 100,
      refunds_cut_share: 1,
      settled_net: 100,
    });
    expect(await db().select().from(payouts)).toEqual([]);
    const [after] = await db().select().from(npos).where(eq(npos.id, npo!.id));
    expect(after!.cash).toBe(0);
  });

  test("a routed donation reads like a pooled one on every dist-keyed surface", async () => {
    // one npo routes, its twin is not connected; each takes the same gift
    const routed = await seed_npo(db(), {
      ...ROUTABLE,
      allocation: { cash: 100, liq: 0, lock: 0 },
      registration_number: "EIN-ROUTED-2",
    });
    const pooled = await seed_npo(db(), {
      ...ROUTABLE,
      allocation: { cash: 100, liq: 0, lock: 0 },
      stripe_account_id: null,
      registration_number: "EIN-POOLED-2",
    });
    const reads = async (npo_id: number, don_id: string) => {
      const prog_id = `prog-${don_id}`;
      await db().insert(programs).values({
        id: prog_id,
        npo_id,
        title: "Clean water",
        description_pt: "[]",
      });
      await seed_donation("stripe:card", don_id);
      await db()
        .update(donations)
        .set({ program_id: prog_id, program_name: "Clean water" })
        .where(eq(donations.id, don_id));
      await db()
        .insert(donation_donors)
        .values({ donation_id: don_id, email: "ada@test.com", name: "Ada" });

      await settle({
        ...make_input(npo_id, "stripe:card", don_id),
        program: { id: prog_id, name: "Clean water" },
      });

      const { items } = await npo_donations(npo_id, { limit: 10 });
      const zapier = (await zapier_samples({
        request: new Request("https://x/api/zapier", {
          headers: { "x-api-key": String(npo_id) },
        }),
        params: {},
        context: {},
      } as never)) as Response;
      return {
        donations: items.map((d) => ({
          status: d.status,
          amount: d.amount,
          amount_usd: d.amount_usd,
          net: d.net,
          via: d.via,
          from_email: d.from_email,
          from_name: d.from_name,
          program_name: d.program_name,
        })),
        donors: (await npo_donor_list(npo_id)).items,
        zapier: ((await zapier.json()) as Record<string, unknown>[]).map(
          ({ id: _, recipient_id: __, program_id: ___, ...item }) => item
        ),
        program_total: (await npo_program_get(prog_id))?.total_donations,
      };
    };

    const pooled_reads = await reads(pooled!.id, "don-pooled-2");
    const routed_reads = await reads(routed!.id, "don-routed-2");

    expect(routed_reads).toEqual(pooled_reads);
    // a read that came back empty on both sides would match as well
    expect(routed_reads.donations).toEqual([
      expect.objectContaining({
        status: "settled",
        net: 100,
        from_name: "Ada",
      }),
    ]);
    expect(routed_reads.donors).toEqual([
      { email: "ada@test.com", name: "Ada", count: 1, total: 100 },
    ]);
    expect(routed_reads.zapier).toEqual([
      expect.objectContaining({ amount: 100, donor_email: "ada@test.com" }),
    ]);
    expect(routed_reads.program_total).toBe(100);
  });

  test("a public message stores the settlement dollars in the gift's currency", async () => {
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      registration_number: "EIN-PHP-MSG",
    });
    const don_id = "don-php-msg";
    await db().insert(donations).values({
      id: don_id,
      upusd: 50,
      status: "settled",
      amount_base: 500,
      amount_tip: 0,
      amount_fee_allowance: 0,
      currency: "PHP",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe:card",
    });
    const input = make_input(npo!.id, "stripe:card", don_id);
    await settle({
      ...input,
      ps: { ...input.ps, sttl: amt(10) },
      tx: {
        ...input.tx,
        currency: "PHP",
        upusd: 50,
        from_public: true,
        from_public_msg_to_npo: "Salamat",
        from_name: "Ivy",
      },
    });

    const [stored] = await db()
      .select()
      .from(donation_messages)
      .where(eq(donation_messages.donation_id, don_id));
    expect(stored?.amount).toBe(500);
    const page = await donation_message_list(String(npo!.id));
    expect(page.items).toEqual([
      expect.objectContaining({ amount: 10, donor_message: "Salamat" }),
    ]);
  });
});

describe("preview_settlement", () => {
  beforeEach(async () => {
    flags.routing = true;
    await db().delete(payouts);
    await db().delete(bal_txs);
    await db().delete(rev_logs);
    await db().delete(dists);
    await db().delete(donation_donors);
    await db().delete(donations);
    await db().delete(programs);
    await db().delete(npos);
  });

  const records = async (via: string) => {
    const npo = await seed_npo(db(), {
      ...ROUTABLE,
      registration_number: `EIN-PREVIEW-${via}`,
    });
    const preview = await preview_settlement(make_input(npo!.id, via));
    return (preview!.txs as { _record: string }[]).map((t) => t._record);
  };

  // the admin sees what settle_npo will write
  test("shows a routed card gift with no payout or balance", async () => {
    expect(await records("stripe:card")).toEqual([
      "distribution",
      "revenue_log",
    ]);
  });

  test("shows the same npo's daf gift with its payout and balances", async () => {
    expect(await records("daf")).toEqual([
      "distribution",
      "revenue_log",
      "balance_tx",
      "balance_tx",
      "payout",
    ]);
  });
});
