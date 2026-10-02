import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  donation_donors,
  donation_recipients,
  donations,
} from "$/pg/schema/donation";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const send_email_mock = vi.hoisted(() => vi.fn());
const template_mock = vi.hoisted(() =>
  vi.fn((_d: any) => ({ node: null, subject: "verify" }))
);
const pm_retrieve_mock = vi.hoisted(() => vi.fn());
const status_mock = vi.hoisted(() => vi.fn());
const donation_update_mock = vi.hoisted(() => vi.fn());
// "fake": the first describe stubs the db and the donation queries; "real": the
// second runs the handler over pglite with the real lock + update
const mode = vi.hoisted(() => ({ fake: true }));
const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("emails", () => ({
  donation_microdeposit_action: { template: template_mock },
}));
vi.mock("$/email", () => ({ send_email: send_email_mock }));
vi.mock("$/kit/stripe", () => ({
  stripe: { paymentMethods: { retrieve: pm_retrieve_mock } },
}));
vi.mock("$/pg/db", () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        if (mode.fake && prop === "transaction") {
          return (fn: (tx: unknown) => unknown) => fn({});
        }
        const real = test_db.current?.db;
        if (!real) throw new Error("test_db not initialized");
        return (real as any)[prop];
      },
    }
  ),
}));
vi.mock("$/pg/queries/donation", async (io) => {
  const actual = await io<typeof import("$/pg/queries/donation")>();
  return {
    ...actual,
    donation_settle_state_locked: (tx: any, id: string) =>
      mode.fake
        ? status_mock().then((status: string) => ({ status }))
        : actual.donation_settle_state_locked(tx, id),
    donation_update: (...args: [any, string, any]) =>
      mode.fake
        ? donation_update_mock(...args)
        : actual.donation_update(...args),
  };
});

const { create_test_db } = await import("$/pg/test-utils/pglite");
const { handle_intent_requires_action } = await import(
  "./intent-requires-action"
);

const ORDER_ID = "order-1";

const intent = () =>
  ({
    id: "pi_1",
    metadata: { order_id: ORDER_ID },
    payment_method: "pm_1",
    next_action: {
      type: "verify_with_microdeposits",
      verify_with_microdeposits: { hosted_verification_url: "https://verify" },
    },
  }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  pm_retrieve_mock.mockResolvedValue({ type: "us_bank_account" });
  donation_update_mock.mockResolvedValue({
    to_name: "ACME",
    from_name: "Ada Lovelace",
    from_email: "ada@example.org",
  });
  send_email_mock.mockResolvedValue(undefined);
});

describe("stripe requires_action (microdeposits) → verification email", () => {
  beforeEach(() => {
    mode.fake = true;
  });

  it("leaves a donation that has since settled alone and sends no verification link", async () => {
    status_mock.mockResolvedValue("settled");

    await handle_intent_requires_action(intent());

    expect(donation_update_mock).not.toHaveBeenCalled();
    expect(send_email_mock).not.toHaveBeenCalled();
  });

  it.each(["created", "intent"])(
    "marks a %s donation as intent and emails the verification link",
    async (status) => {
      status_mock.mockResolvedValue(status);

      await handle_intent_requires_action(intent());

      expect(donation_update_mock.mock.calls[0]![2]).toMatchObject({
        status: "intent",
        via_extra: "https://verify",
      });
      expect(send_email_mock).toHaveBeenCalledOnce();
      expect(send_email_mock.mock.calls[0]![0].to).toEqual(["ada@example.org"]);
    }
  );
});

describe("stripe requires_action over the real db", () => {
  beforeAll(async () => {
    test_db.current = await create_test_db();
  }, 30_000);

  afterAll(async () => {
    await test_db.current?.client.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    mode.fake = false;
    const db = test_db.current!.db;
    await db.delete(donation_donors);
    await db.delete(donation_recipients);
    await db.delete(donations);
    await db.delete(npos);
  });

  const seed = async (status: string) => {
    const db = test_db.current!.db;
    const [npo] = await db
      .insert(npos)
      .values({
        registration_number: "EIN-REQ-ACTION",
        name: "ACME",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
      })
      .returning();
    await db.insert(donations).values({
      id: ORDER_ID,
      upusd: 1,
      status: status as any,
      amount_base: 100,
      amount_tip: 0,
      amount_fee_allowance: 0,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe:card",
    });
    await db.insert(donation_recipients).values({
      donation_id: ORDER_ID,
      npo_id: npo!.id,
      name: "ACME",
      type: "npo",
    });
    await db.insert(donation_donors).values({
      donation_id: ORDER_ID,
      email: "ada@example.org",
      name: "Ada Lovelace",
    });
  };

  const row = async () =>
    (
      await test_db
        .current!.db.select({
          status: donations.status,
          via: donations.via,
          via_extra: donations.via_extra,
        })
        .from(donations)
        .where(eq(donations.id, ORDER_ID))
    )[0];

  it.each(["created", "intent"])(
    "writes the verification link onto a %s donation and emails the donor",
    async (status) => {
      await seed(status);

      await handle_intent_requires_action(intent());

      expect(await row()).toEqual({
        status: "intent",
        via: "stripe:us_bank_account",
        via_extra: "https://verify",
      });
      expect(send_email_mock).toHaveBeenCalledOnce();
      expect(send_email_mock.mock.calls[0]![0].to).toEqual(["ada@example.org"]);
    }
  );

  it.each(["settled", "refunded"])(
    "leaves a %s donation row untouched and sends no link when the event is redelivered",
    async (status) => {
      await seed(status);

      await handle_intent_requires_action(intent());

      expect(await row()).toEqual({
        status,
        via: "stripe:card",
        via_extra: null,
      });
      expect(send_email_mock).not.toHaveBeenCalled();
    }
  );

  it("reads the donation's state under a row lock, so a concurrent settle cannot interleave", async () => {
    await seed("created");
    // pglite has one connection, so a competing writer cannot be raced: the
    // lock shows only in the statement the transaction sends
    const client = test_db.current!.client as any;
    const begin = client.transaction.bind(client);
    const sent: string[] = [];
    vi.spyOn(client, "transaction").mockImplementation(((fn: any) =>
      begin((pg: any) => {
        const query = pg.query.bind(pg);
        pg.query = (text: string, ...rest: unknown[]) => {
          sent.push(text);
          return query(text, ...rest);
        };
        return fn(pg);
      })) as any);

    await handle_intent_requires_action(intent());

    const read = sent.filter(
      (q) => /from "donations"/i.test(q) && /^\s*select/i.test(q)
    );
    // the first read of the row is the locking one; later reads are the update's
    expect(read[0]).toMatch(/for update\s*$/i);
  });

  it("throws on an order the db does not hold and sends nothing", async () => {
    await expect(handle_intent_requires_action(intent())).rejects.toThrow(
      /donation not found: order-1/
    );
    expect(send_email_mock).not.toHaveBeenCalled();
  });
});
