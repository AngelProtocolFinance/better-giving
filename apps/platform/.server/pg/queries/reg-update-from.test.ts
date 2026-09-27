import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { EDITABLE, type TStatus } from "@/reg/schema";
import { registrations } from "../schema/registration";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { reg_update_from } from "./registration";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which this query does not read.
const as_db = (x: unknown) => x as DbOrTx;

const SEEN_AT = "2026-09-01T00:00:00.000Z";

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(registrations);
});

const seed = (status: TStatus | null) =>
  test_db.db.insert(registrations).values({
    id: "r-1",
    r_id: "jane@test.com",
    status,
    o_name: "Before",
    updated_at: SEEN_AT,
  });

const row = async () =>
  (
    await test_db.db
      .select()
      .from(registrations)
      .where(eq(registrations.id, "r-1"))
  )[0]!;

describe("reg_update_from", () => {
  test("writes a draft row and returns it", async () => {
    await seed("01");

    const updated = await reg_update_from(as_db(test_db.db), "r-1", EDITABLE, {
      o_name: "After",
    });

    expect(updated?.o_name).toBe("After");
    expect((await row()).o_name).toBe("After");
  });

  // a step save from a stale tab, or a second submit press, arrives after the
  // row left the draft states; it must not drag the row back out of review.
  test.each<TStatus>(["02", "03"])(
    "leaves a %s row untouched and returns null",
    async (status) => {
      await seed(status);

      const updated = await reg_update_from(
        as_db(test_db.db),
        "r-1",
        EDITABLE,
        { status: "01", o_name: "After" }
      );

      expect(updated).toBeNull();
      const after = await row();
      expect(after.status).toBe(status);
      expect(after.o_name).toBe("Before");
      expect(after.updated_at).toBe(SEEN_AT);
    }
  );

  test("writes a rejected row, which the applicant reopens", async () => {
    await seed("04");

    const updated = await reg_update_from(as_db(test_db.db), "r-1", EDITABLE, {
      status: "01",
    });

    expect(updated?.status).toBe("01");
    expect((await row()).status).toBe("01");
  });

  test("writes a legacy row with no status when null is in from", async () => {
    await seed(null);

    const updated = await reg_update_from(as_db(test_db.db), "r-1", EDITABLE, {
      status: "01",
    });

    expect(updated?.status).toBe("01");
    expect((await row()).status).toBe("01");
  });

  test("leaves a row with no status untouched when null is not in from", async () => {
    await seed(null);

    const updated = await reg_update_from(as_db(test_db.db), "r-1", ["01"], {
      status: "02",
    });

    expect(updated).toBeNull();
    expect((await row()).status).toBeNull();
  });
});
