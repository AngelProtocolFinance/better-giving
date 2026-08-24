import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

// --- mocks (hoisted) ---

// refusing to name an owner is invisible to the caller — it looks like a form
// nobody filed. the report is the only signal the duplicate exists.
const report_error = vi.hoisted(() => vi.fn());
vi.mock("@/errors/report", () => ({ report_error }));

// --- imports (after mocks) ---

import { user } from "../schema/auth";
import { create_test_db, type TestDb } from "../test-utils/pglite-browser";
import type { DbOrTx } from "./helpers";
import { user_by_w_form } from "./user";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which this query does not read.
const as_db = (x: unknown) => x as DbOrTx;

const EID = "docGroupShared";

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await test_db.db.delete(user);
});

/** a user claiming `w_form` as the document group of their signed form */
async function seed(id: string, w_form: string | null) {
  await test_db.db.insert(user).values({
    id,
    name: `${id} name`,
    email: `${id}@test.com`,
    first_name: "Ada",
    last_name: "Lovelace",
    w_form,
  });
}

describe("user_by_w_form", () => {
  test("one claimant is the owner", async () => {
    await seed("u-1", EID);

    const row = await user_by_w_form(EID, as_db(test_db.db));

    expect(row?.email).toBe("u-1@test.com");
  });

  test("two claimants resolve to nobody", async () => {
    await seed("u-1", EID);
    await seed("u-2", EID);

    const row = await user_by_w_form(EID, as_db(test_db.db));

    expect(row).toBeUndefined();
  });

  test("two claimants are reported", async () => {
    await seed("u-1", EID);
    await seed("u-2", EID);

    await user_by_w_form(EID, as_db(test_db.db));

    expect(report_error).toHaveBeenCalledOnce();
  });

  test("the report carries the claimants, never the eid", async () => {
    await seed("u-1", EID);
    await seed("u-2", EID);

    await user_by_w_form(EID, as_db(test_db.db));

    // the eid authorizes a download of the signed form; a report reaches
    // sentry and stdout.
    const reported = JSON.stringify(report_error.mock.calls[0]!.map(String));
    expect(reported).not.toContain(EID);

    const ctx = report_error.mock.calls[0]![1];
    expect(JSON.stringify(ctx)).not.toContain(EID);
    expect(ctx).toMatchObject({
      claimants: 2,
      claimant_emails: expect.arrayContaining(["u-1@test.com", "u-2@test.com"]),
    });
  });

  test("the ordinary single claimant reports nothing", async () => {
    await seed("u-1", EID);

    await user_by_w_form(EID, as_db(test_db.db));

    expect(report_error).not.toHaveBeenCalled();
  });

  test("an eid nobody claims is undefined", async () => {
    await seed("u-1", "someOtherGroup");

    const row = await user_by_w_form(EID, as_db(test_db.db));

    expect(row).toBeUndefined();
  });
});
