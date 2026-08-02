import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { IDonMatchChasePayload } from "@/queue";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "$/pg/schema/donation";
import { donation_match_events } from "$/pg/schema/match";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

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

// the only seam that is faked. the whole point of this handler is which rows
// suppress the reminder, and that is decided by one conditional UPDATE against
// real postgres — a mocked query would assert nothing about it.
const send_email = vi.hoisted(() =>
  vi.fn(async (_i: { node: any; to: string[]; subject: string }) => ({
    data: { id: "email-1", response: "250 ok" },
    error: null,
  }))
);
vi.mock("$/email", () => ({ send_email, sender: "test@test.com" }));

// --- imports (after mocks) ---

import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { handle_don_match_chase } from "./handle-don-match-chase";

// --- setup ---

let counter = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await test_db.current!.db.delete(donation_match_events);
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

/**
 * a donation whose pack already went out — the only state a chase is ever armed
 * from. `stamps` overrides what the event row records, which is the whole
 * subject of these tests.
 */
async function seed(o?: {
  company_name?: string | null;
  email?: string;
  stamps?: Partial<{
    pack_sent_at: string | null;
    chased_at: string | null;
    submitted_at: string | null;
  }>;
}) {
  counter++;
  const db = test_db.current!.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: `EIN-CHASE-${counter}`,
      name: `Test NPO ${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();

  const id = `don-${counter}`;
  await db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 50,
    amount_tip: 5,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db.insert(donation_recipients).values({
    donation_id: id,
    npo_id: npo!.id,
    name: npo!.name,
    type: "npo",
    tip_allowed: true,
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: o?.email ?? "donor@test.com",
    name: "Ada Lovelace",
    company_name: o?.company_name ?? "Acme Inc",
  });
  await db.insert(donation_match_events).values({
    id: `evt-${counter}`,
    donation_id: id,
    pack_sent_at: "2026-01-02T03:04:05Z",
    ...o?.stamps,
  });

  const payload: IDonMatchChasePayload = { id };
  return { id, npo_name: npo!.name, payload };
}

const events = () =>
  test_db
    .current!.db.select()
    .from(donation_match_events)
    .orderBy(donation_match_events.donation_id);

describe("handle_don_match_chase — first delivery", () => {
  test("stamps the chase and mails the reminder once", async () => {
    const { payload } = await seed();

    await handle_don_match_chase(payload);

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.chased_at).not.toBeNull();

    expect(send_email).toHaveBeenCalledTimes(1);
    expect(send_email.mock.calls[0]![0].to).toEqual(["donor@test.com"]);
  });

  test("echoes the employer the donor named, and the same donation figures", async () => {
    const { id, npo_name } = await seed({ company_name: "Globex" });

    await handle_don_match_chase({ id });

    // `send_email` is the seam, so the template's props are the contract this
    // asserts — the rendered html is the emails package's business.
    const data = send_email.mock.calls[0]![0].node.props;
    expect(data.employer_name).toBe("Globex");
    expect(data.to_name).toBe(npo_name);
    expect(data.id).toBe(id);
    expect(data.from.first_name).toBe("Ada");
    // the base gift, never the tip
    expect(data.amount.value).toBe(50);
  });
});

describe("handle_don_match_chase — redelivery", () => {
  test("the second delivery mails nothing and leaves the first stamp alone", async () => {
    const { payload } = await seed();

    await handle_don_match_chase(payload);
    const [first] = await events();

    // qstash re-delivers on any non-2xx, and this message sat around for three
    // days before arriving; neither may reach the donor twice.
    await expect(handle_don_match_chase(payload)).resolves.toBeUndefined();

    const rows = await events();
    expect(send_email).toHaveBeenCalledTimes(1);
    expect(rows[0]!.chased_at).toBe(first!.chased_at);
  });
});

describe("handle_don_match_chase — suppression", () => {
  test("a donor who already filed is not chased, and no stamp is written", async () => {
    const { payload } = await seed({
      stamps: { submitted_at: "2026-01-03T00:00:00Z" },
    });

    await expect(handle_don_match_chase(payload)).resolves.toBeUndefined();

    const rows = await events();
    expect(send_email).not.toHaveBeenCalled();
    // nothing is chased *about*, so nothing records having chased
    expect(rows[0]!.chased_at).toBeNull();
  });

  test("an event whose pack never went out is not chased", async () => {
    const { payload } = await seed({ stamps: { pack_sent_at: null } });

    await expect(handle_don_match_chase(payload)).resolves.toBeUndefined();

    const rows = await events();
    expect(send_email).not.toHaveBeenCalled();
    expect(rows[0]!.chased_at).toBeNull();
  });
});

describe("handle_don_match_chase — a refused send", () => {
  // `send_email` never throws; a provider refusal comes back like this
  const refused = { data: null, error: new Error("550 mailbox unavailable") };

  test("is recorded, since the stamp already reads as chased", async () => {
    const { payload } = await seed();
    send_email.mockResolvedValueOnce(refused as never);

    await expect(handle_don_match_chase(payload)).resolves.toBeUndefined();

    const rows = await events();
    // both stamps stand: the chase is at-most-once, so rolling `chased_at` back
    // to recover this mail is how a donor gets chased twice
    expect(rows[0]!.chased_at).not.toBeNull();
    expect(rows[0]!.send_failed_at).not.toBeNull();
    expect(rows[0]!.send_failed_kind).toBe("chase");
  });

  test("a chase that lands records nothing", async () => {
    const { payload } = await seed();

    await handle_don_match_chase(payload);

    const rows = await events();
    expect(rows[0]!.send_failed_at).toBeNull();
    expect(rows[0]!.send_failed_kind).toBeNull();
  });
});
