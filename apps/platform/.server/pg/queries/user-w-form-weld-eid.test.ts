import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { user } from "../schema/auth";
import { create_test_db, type TestDb } from "../test-utils/pglite-browser";
import type { DbOrTx } from "./helpers";
import { user_w_form_weld_eid, user_w_form_weld_eid_set } from "./user";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read.
const as_db = (x: unknown) => x as DbOrTx;

const EMAIL = "ada@test.com";

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

beforeEach(async () => {
  await test_db.db.delete(user);
  await test_db.db.insert(user).values({
    id: "u-1",
    name: "Ada Lovelace",
    email: EMAIL,
    first_name: "Ada",
    last_name: "Lovelace",
  });
});

describe("w_form_weld_eid round trip", () => {
  test("the minted eid reads back for the user it was recorded against", async () => {
    await user_w_form_weld_eid_set(EMAIL, "weld-abc", as_db(test_db.db));

    const eid = await user_w_form_weld_eid(EMAIL, as_db(test_db.db));

    expect(eid).toBe("weld-abc");
  });

  test("a user who was never sent to the form has no eid", async () => {
    const eid = await user_w_form_weld_eid(EMAIL, as_db(test_db.db));

    expect(eid).toBeNull();
  });

  test("an unknown email is undefined, not null", async () => {
    const eid = await user_w_form_weld_eid(
      "nobody@test.com",
      as_db(test_db.db)
    );

    expect(eid).toBeUndefined();
  });

  test("recording against no user throws rather than passing silently", async () => {
    await expect(
      user_w_form_weld_eid_set("nobody@test.com", "weld-abc", as_db(test_db.db))
    ).rejects.toThrow();
  });

  test("a throw records nothing", async () => {
    await user_w_form_weld_eid_set(
      "nobody@test.com",
      "weld-abc",
      as_db(test_db.db)
    ).catch(() => {});

    const eid = await user_w_form_weld_eid(EMAIL, as_db(test_db.db));

    expect(eid).toBeNull();
  });

  test("re-minting replaces the eid rather than accumulating", async () => {
    await user_w_form_weld_eid_set(EMAIL, "weld-first", as_db(test_db.db));
    await user_w_form_weld_eid_set(EMAIL, "weld-second", as_db(test_db.db));

    const eid = await user_w_form_weld_eid(EMAIL, as_db(test_db.db));

    expect(eid).toBe("weld-second");
  });
});
