import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import type { IDonation } from "@/donations";
import { donations } from "../schema/donation";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import { agent_checkout_save, agent_donation_expire } from "./donation";
import type { DbOrTx } from "./helpers";

const as_db = (x: unknown) => x as DbOrTx;

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(donations);
});

async function seed(
  id: string,
  status: IDonation["status"],
  source: IDonation["source"] = "bg-agent",
  via_extra = "cs_test_open"
) {
  const now = new Date().toISOString();
  await test_db.db.insert(donations).values({
    id,
    upusd: 1,
    status,
    amount_base: 10,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source,
    via: "stripe",
    via_extra,
    created_at: now,
    updated_at: now,
  });
}

const status_of = async (id: string) => {
  const [row] = await test_db.db
    .select({ status: donations.status })
    .from(donations)
    .where(eq(donations.id, id));
  return row?.status;
};

describe("agent_donation_expire", () => {
  test("expires an unpaid agent checkout", async () => {
    await seed("don-open", "created");

    expect(
      await agent_donation_expire("don-open", "cs_test_open", as_db(test_db.db))
    ).toBe(true);
    expect(await status_of("don-open")).toBe("expired");
  });

  test.each<IDonation["status"]>(["settled", "confirmed", "expired"])(
    "leaves a %s agent donation alone",
    async (status) => {
      await seed("don-done", status);

      expect(
        await agent_donation_expire(
          "don-done",
          "cs_test_open",
          as_db(test_db.db)
        )
      ).toBe(false);
      expect(await status_of("don-done")).toBe(status);
    }
  );

  test("never touches a donation from another source", async () => {
    await seed("don-form", "created", "bg-marketplace");

    expect(
      await agent_donation_expire("don-form", "cs_test_open", as_db(test_db.db))
    ).toBe(false);
    expect(await status_of("don-form")).toBe("created");
  });

  test("a replaced session's expiry does not expire the new checkout", async () => {
    await seed("don-replaced", "created", "bg-agent", "cs_test_new");

    expect(
      await agent_donation_expire(
        "don-replaced",
        "cs_test_old",
        as_db(test_db.db)
      )
    ).toBe(false);
    expect(await status_of("don-replaced")).toBe("created");
  });
});

describe("agent_checkout_save", () => {
  test("records the session while the gift is unpaid", async () => {
    await seed("don-open", "expired");

    expect(
      await agent_checkout_save("don-open", "cs_test_new", as_db(test_db.db))
    ).toBe(true);
    expect(await status_of("don-open")).toBe("created");
  });

  test("does not move a settled gift back to created", async () => {
    await seed("don-paid", "settled");

    expect(
      await agent_checkout_save("don-paid", "cs_test_late", as_db(test_db.db))
    ).toBe(false);
    expect(await status_of("don-paid")).toBe("settled");
  });
});
