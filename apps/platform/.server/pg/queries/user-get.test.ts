import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  test,
} from "vitest";
import { user } from "../schema/auth";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { user_by_referral_code, user_get } from "./user";

// pglite's drizzle handle differs from neon's only in the result-type HKT,
// which these queries do not read.
const as_db = (x: unknown) => x as DbOrTx;

type Row = NonNullable<Awaited<ReturnType<typeof user_get>>>;

const EMAIL = "ada@test.com";
const CODE = "ADA-1";

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
    referral_code: CODE,
    w_form: "doc-group-eid",
    w_form_weld_eid: "weld-eid",
  });
});

describe("user_get projection", () => {
  test("the weld eid does not travel with the row", async () => {
    const row = await user_get(EMAIL, as_db(test_db.db));

    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("w_form_weld_eid");
  });

  test("the columns the callers read do travel", async () => {
    const row = await user_get(EMAIL, as_db(test_db.db));

    expect(row).toMatchObject({
      email: EMAIL,
      first_name: "Ada",
      last_name: "Lovelace",
      referral_code: CODE,
      w_form: "doc-group-eid",
    });
  });

  test("the columns the table leaves nullable arrive null, and say so", async () => {
    const row = await user_get(EMAIL, as_db(test_db.db));

    expect(row?.avatar_url).toBeNull();
    expect(row?.signup_date).toBeNull();
    expect(row?.pay_id).toBeNull();
    expectTypeOf<Row["avatar_url"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["signup_date"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["pay_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["w_form"]>().toEqualTypeOf<string | null>();
  });

  test("only the columns the table marks notNull are non-null", async () => {
    expectTypeOf<Row["email"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["first_name"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["last_name"]>().toEqualTypeOf<string>();
    expectTypeOf<Row["referral_code"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["pref_currency"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Row["pay_min"]>().toEqualTypeOf<number | null>();
  });

  // `username` and `client_id` are legacy dynamo fields with no column behind
  // them — if either crept back into the row type, a caller reaching for one
  // would get undefined at runtime while the compiler promised a string.
  test("the row type carries the projected columns and nothing else", async () => {
    expectTypeOf<keyof Row>().toEqualTypeOf<
      | "email"
      | "first_name"
      | "last_name"
      | "avatar_url"
      | "pref_currency"
      | "referral_code"
      | "signup_date"
      | "pay_id"
      | "pay_min"
      | "w_form"
    >();
  });

  test("an unknown email is undefined", async () => {
    const row = await user_get("nobody@test.com", as_db(test_db.db));

    expect(row).toBeUndefined();
  });
});

describe("user_by_referral_code projection", () => {
  test("the weld eid does not travel with the row", async () => {
    const row = await user_by_referral_code(CODE, as_db(test_db.db));

    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("w_form_weld_eid");
  });

  test("the columns the callers read do travel", async () => {
    const row = await user_by_referral_code(CODE, as_db(test_db.db));

    expect(row).toMatchObject({
      email: EMAIL,
      first_name: "Ada",
      last_name: "Lovelace",
      referral_code: CODE,
    });
  });

  test("an unknown code is undefined", async () => {
    const row = await user_by_referral_code("NOBODY-1", as_db(test_db.db));

    expect(row).toBeUndefined();
  });
});
