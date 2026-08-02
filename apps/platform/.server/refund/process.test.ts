import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "../pg/schema/donation";
import { donation_match_events } from "../pg/schema/match";
import { npos } from "../pg/schema/npo";
import type { TestDb } from "../pg/test-utils/pglite-browser";

// --- mocks ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("../pg/db", () => ({
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

vi.mock("../kit/discord", () => ({ fiat_monitor: { send_alert: vi.fn() } }));

const report_error = vi.hoisted(() => vi.fn());
vi.mock("@/errors/report", () => ({ report_error }));

// the heads-up's only side effect. mocked at the module rather than at the
// transport, so a test can make the send throw as well as refuse.
const send_email = vi.hoisted(() => vi.fn());
vi.mock("../email", () => ({ send_email }));

// --- imports (after mocks) ---

import { create_test_db } from "../pg/test-utils/pglite-browser";
import { process_refund } from "./process";

// --- setup ---

const ctx = { form_id: null, program_id: null, alert_from: "test" };
let counter = 0;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  send_email.mockResolvedValue({ data: { id: "msg-1" }, error: null });
  await test_db.current!.db.delete(donation_match_events);
  await test_db.current!.db.delete(donation_donors);
  await test_db.current!.db.delete(donation_recipients);
  await test_db.current!.db.delete(donations);
  await test_db.current!.db.delete(npos);
  counter = 0;
});

/**
 * a settled donation, optionally with a match event. no dists: an empty graph
 * list is the shape that isolates the finalization step, so what runs is
 * exactly the status flip, the void, and the heads-up.
 */
async function seed(o?: {
  stamps?: Partial<{ pack_sent_at: string; submitted_at: string }>;
  event?: boolean;
  company_name?: string | null;
}) {
  counter++;
  const db = test_db.current!.db;
  const [npo] = await db
    .insert(npos)
    .values({
      registration_number: `EIN-REF-${counter}`,
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
    amount_base: 250,
    amount_tip: 0,
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
  });
  await db.insert(donation_donors).values({
    donation_id: id,
    email: "donor@test.com",
    name: "Ada Lovelace",
    company_name: o?.company_name ?? "Acme Inc",
  });

  if (o?.event !== false) {
    await db.insert(donation_match_events).values({
      id: `evt-${counter}`,
      donation_id: id,
      pack_sent_at: "2026-07-01T00:00:00.000Z",
      ...o?.stamps,
    });
  }
  return { id, npo_name: npo!.name };
}

const events = () => test_db.current!.db.select().from(donation_match_events);
const dons = () => test_db.current!.db.select().from(donations);

describe("process_refund — voiding the match event", () => {
  test("stamps the void alongside the status flip", async () => {
    const { id } = await seed();

    await process_refund(id, [], ctx);

    expect((await dons())[0]!.status).toBe("refunded");
    const [ev] = await events();
    expect(ev!.voided_at).not.toBeNull();
    expect(ev!.void_reason).toBe("refunded");
  });

  test("a donation that never entered the workflow still flips", async () => {
    const { id } = await seed({ event: false });

    await process_refund(id, [], ctx);

    expect((await dons())[0]!.status).toBe("refunded");
    expect(await events()).toHaveLength(0);
  });
});

describe("process_refund — the filed-claim heads-up", () => {
  test("mails the team when the donor had already filed", async () => {
    const { id, npo_name } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });

    await process_refund(id, [], ctx);

    expect(send_email).toHaveBeenCalledTimes(1);
    const sent = send_email.mock.calls[0]![0];
    // internal only: the beneficiary has nothing to answer, and the donor asked
    // for their own money back
    expect(sent.to).toEqual(["hi@better.giving"]);
    const data = sent.node.props;
    expect(data.employer_name).toBe("Acme Inc");
    expect(data.donor_email).toBe("donor@test.com");
    expect(data.to_name).toBe(npo_name);
    // compared as an instant: pglite hands back timestamptz in a local offset
    // where neon's driver hands back a Date, and the template only ever
    // subtracts the two stamps
    expect(new Date(data.filed_at).toISOString()).toBe(
      "2026-07-02T00:00:00.000Z"
    );
    expect(data.void_reason).toBe("refunded");
  });

  test("says nothing when the claim was never filed", async () => {
    // the pack went out and the donor never came back — there is no claim
    // outstanding anywhere, so a refund is unremarkable
    const { id } = await seed();

    await process_refund(id, [], ctx);

    expect(send_email).not.toHaveBeenCalled();
  });

  test("says nothing when there is no event at all", async () => {
    const { id } = await seed({ event: false });

    await process_refund(id, [], ctx);

    expect(send_email).not.toHaveBeenCalled();
  });

  test("a refused send is reported and does not fail the refund", async () => {
    const { id } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });
    // send_email swallows provider errors into its return
    send_email.mockResolvedValue({ data: null, error: new Error("550") });

    const res = await process_refund(id, [], ctx);

    expect(res.failures).toEqual([]);
    expect(report_error).toHaveBeenCalled();
    // the money is already back; a missing notice is not a failed refund
    expect((await dons())[0]!.status).toBe("refunded");
  });

  test("a throwing send does not fail the refund either", async () => {
    const { id } = await seed({
      stamps: { submitted_at: "2026-07-02T00:00:00.000Z" },
    });
    send_email.mockRejectedValue(new Error("connection reset"));

    await expect(process_refund(id, [], ctx)).resolves.toMatchObject({
      failures: [],
    });
    expect((await dons())[0]!.status).toBe("refunded");
  });
});
