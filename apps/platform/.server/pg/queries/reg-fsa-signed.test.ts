import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TStatus } from "@/reg/schema";
import type { TestDb } from "../test-utils/pglite";

// --- hoisted refs ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

// --- mocks ---

// the query reads the module-level handle rather than taking one, so the
// pglite db is swapped in behind it.
vi.mock("../db", () => ({
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

// --- imports (after mocks) ---

import { eq } from "drizzle-orm";
import { registrations } from "../schema/registration";
import { create_test_db } from "../test-utils/pglite";
import { reg_fsa_signed } from "./registration";

const SEEN_AT = "2026-08-24T10:00:00.000Z";
const EID = "docGroup1";
const URL = `https://app.test/api/anvil-doc/${EID}`;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(registrations);
});

const seed = (status: TStatus) =>
  test_db.current!.db.insert(registrations).values({
    id: "r-1",
    r_id: "jane@test.com",
    status,
    o_fsa_signing_url: "https://anvil.test/sign",
    o_fsa_doc_eid: EID,
    updated_at: SEEN_AT,
  });

const row = async () =>
  (
    await test_db
      .current!.db.select()
      .from(registrations)
      .where(eq(registrations.id, "r-1"))
  )[0]!;

describe("reg_fsa_signed", () => {
  test("records the signed agreement on a draft row", async () => {
    await seed("01");

    const res = await reg_fsa_signed("r-1", EID, URL);

    expect(res.won).toBe(true);
    expect((await row()).o_fsa_signed_doc_url).toBe(URL);
  });

  // the packet write already put the row back to draft; a replay landing after
  // an admin rejection must not reopen it.
  test("records the agreement on a rejected row without reopening it", async () => {
    await seed("04");

    const res = await reg_fsa_signed("r-1", EID, URL);

    expect(res).toMatchObject({ won: true, row: { status: "04" } });
    const after = await row();
    expect(after.status).toBe("04");
    expect(after.o_fsa_signed_doc_url).toBe(URL);
  });

  // anvil replays its webhook; a replay landing after submit or approval must
  // not pull the application back to draft.
  test.each<TStatus>(["02", "03"])(
    "leaves a %s row untouched and reports the miss",
    async (status) => {
      await seed(status);

      const res = await reg_fsa_signed("r-1", EID, URL);

      expect(res).toMatchObject({ won: false, row: { status } });
      const after = await row();
      expect(after.status).toBe(status);
      expect(after.o_fsa_signed_doc_url).toBeNull();
      expect(after.updated_at).toBe(SEEN_AT);
    }
  );
});
