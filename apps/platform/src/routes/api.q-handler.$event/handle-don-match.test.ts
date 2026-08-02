import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { IDonMatchPayload } from "@/queue";
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

// the only seam that is faked: everything below the send — the event row, the
// claim, the donation read — runs against real postgres, because the send-once
// gate is a db guarantee and a mocked query cannot demonstrate it.
const send_email = vi.hoisted(() =>
  vi.fn(async (_i: { node: any; to: string[]; subject: string }) => ({
    data: { id: "email-1", response: "250 ok" },
    error: null,
  }))
);
vi.mock("$/email", () => ({ send_email, sender: "test@test.com" }));

// the chase is armed through qstash, which has no local stand-in; the message
// this hands it is the contract, and `msg()` is left real so a drifting dedupe
// key or delay shows up here rather than in production.
const schedule = vi.hoisted(() => vi.fn(async (..._m: any[]) => {}));
vi.mock("$/kit/queue", () => ({ schedule }));

// --- imports (after mocks) ---

import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { handle_don_match } from "./handle-don-match";

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

async function seed_donation(o?: {
  company_name?: string | null;
  email?: string;
}) {
  counter++;
  const db = test_db.current!.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: `EIN-MATCH-${counter}`,
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

  const payload: IDonMatchPayload = {
    id,
    from_company_name: o?.company_name ?? "Acme Inc",
  };
  return { id, npo_name: npo!.name, payload };
}

const events = () =>
  test_db
    .current!.db.select()
    .from(donation_match_events)
    .orderBy(donation_match_events.donation_id);

describe("handle_don_match — first delivery", () => {
  test("opens the event, stamps the send, and mails the pack once", async () => {
    const { id, payload } = await seed_donation();

    await handle_don_match(payload);

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.donation_id).toBe(id);
    expect(rows[0]!.pack_sent_at).not.toBeNull();

    expect(send_email).toHaveBeenCalledTimes(1);
    const sent = send_email.mock.calls[0]![0];
    expect(sent.to).toEqual(["donor@test.com"]);
  });
});

describe("handle_don_match — arming the chase", () => {
  test("schedules the T+3d chase once the pack is out", async () => {
    const { id, payload } = await seed_donation();

    await handle_don_match(payload);

    expect(schedule).toHaveBeenCalledTimes(1);
    const m = schedule.mock.calls[0]![0];
    expect(m.id).toBe("don-match-chase");
    // the donation id alone — the event is found through it, and nothing else
    // carried here would still be true three days from now
    expect(m.payload).toEqual({ id });
    // scheduled, never enqueued: three days at the head of the FIFO queue would
    // stall every notification behind it
    expect(m.delay_s).toBe(3 * 24 * 60 * 60);
  });

  test("arms it after the send, so an unsent pack is never chased", async () => {
    const { payload } = await seed_donation();

    await handle_don_match(payload);

    expect(send_email.mock.invocationCallOrder[0]!).toBeLessThan(
      schedule.mock.invocationCallOrder[0]!
    );
  });

  test("a delivery that lost the pack claim arms no chase", async () => {
    const { payload } = await seed_donation();

    await handle_don_match(payload);
    await handle_don_match(payload);

    // the redelivery mailed nothing, so it has no reminder to arm either
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

describe("handle_don_match — redelivery", () => {
  test("the second delivery mails nothing and opens no second event", async () => {
    const { payload } = await seed_donation();

    await handle_don_match(payload);
    const [first] = await events();

    // qstash re-delivers on any non-2xx, and the enqueue side can re-raise the
    // same message; neither may reach the donor twice.
    await expect(handle_don_match(payload)).resolves.toBeUndefined();

    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(send_email).toHaveBeenCalledTimes(1);
    // the winner's stamp survives — a lost claim writes nothing at all
    expect(rows[0]!.pack_sent_at).toBe(first!.pack_sent_at);
  });
});

describe("handle_don_match — two donations", () => {
  test("each gets its own event and its own pack", async () => {
    const a = await seed_donation({
      company_name: "Acme Inc",
      email: "a@acme.com",
    });
    const b = await seed_donation({
      company_name: "Globex",
      email: "b@globex.com",
    });

    await handle_don_match(a.payload);
    await handle_don_match(b.payload);

    const rows = await events();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.donation_id)).toEqual([a.id, b.id]);
    for (const r of rows) expect(r.pack_sent_at).not.toBeNull();

    expect(send_email).toHaveBeenCalledTimes(2);
    expect(send_email.mock.calls[0]![0].to).toEqual(["a@acme.com"]);
    expect(send_email.mock.calls[1]![0].to).toEqual(["b@globex.com"]);
  });

  test("one donor's redelivery does not consume the other's claim", async () => {
    const a = await seed_donation({ email: "a@acme.com" });
    const b = await seed_donation({ email: "b@globex.com" });

    await handle_don_match(a.payload);
    await handle_don_match(a.payload);
    await handle_don_match(b.payload);

    expect(send_email).toHaveBeenCalledTimes(2);
    const rows = await events();
    expect(rows).toHaveLength(2);
  });
});

describe("handle_don_match — what the pack carries", () => {
  test("the employer the donor typed, and the donation's own beneficiary", async () => {
    const { id, npo_name, payload } = await seed_donation({
      company_name: "Globex",
    });

    await handle_don_match(payload);

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

describe("handle_don_match — a refused send", () => {
  // `send_email` never throws; a provider refusal comes back like this
  const refused = { data: null, error: new Error("550 mailbox unavailable") };

  test("is recorded, and arms no chase", async () => {
    const { payload } = await seed_donation();
    send_email.mockResolvedValueOnce(refused as never);

    await expect(handle_don_match(payload)).resolves.toBeUndefined();

    const rows = await events();
    // `pack_sent_at` stands — nothing re-drives this, so the row would read as
    // sent with no trace of the loss
    expect(rows[0]!.pack_sent_at).not.toBeNull();
    expect(rows[0]!.send_failed_at).not.toBeNull();
    expect(rows[0]!.send_failed_kind).toBe("pack");
    // asking "did you file yet?" about mail that never arrived is the harm
    expect(schedule).not.toHaveBeenCalled();
  });

  test("a pack that lands records nothing", async () => {
    const { payload } = await seed_donation();

    await handle_don_match(payload);

    const rows = await events();
    expect(rows[0]!.send_failed_at).toBeNull();
    expect(rows[0]!.send_failed_kind).toBeNull();
  });
});

describe("handle_don_match — a voided event", () => {
  test("sends nothing, because the money went back", async () => {
    const { id, payload } = await seed_donation();
    // the refund landed while the message was already in the queue
    await test_db.current!.db.insert(donation_match_events).values({
      id: `evt-void-${id}`,
      donation_id: id,
      voided_at: "2026-01-04T00:00:00Z",
      void_reason: "refunded",
    });

    await expect(handle_don_match(payload)).resolves.toBeUndefined();

    const rows = await events();
    expect(send_email).not.toHaveBeenCalled();
    expect(rows[0]!.pack_sent_at).toBeNull();
    // nothing to chase about either
    expect(schedule).not.toHaveBeenCalled();
  });
});
