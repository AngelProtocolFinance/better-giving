import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "../schema/auth";
import { npos } from "../schema/npo";
import { user_invites } from "../schema/user";
import { create_test_db, type TestDb } from "../test-utils/pglite";
import type { DbOrTx } from "./helpers";
import { npo_admin_tx } from "./user";

// pglite's drizzle handle differs from neon's only in the result-type HKT
const as_db = (x: unknown) => x as DbOrTx;

const INVITEE = "nichole@test.com";

let t: TestDb;
let invitor_id: string;

beforeAll(async () => {
  t = await create_test_db();
}, 30_000);

afterAll(async () => {
  await t?.client.close();
});

beforeEach(async () => {
  await t.db.delete(user_invites);
  await t.db.delete(npos);
  await t.db.delete(user);
  invitor_id = (await seed_user(t.db, "admin@test.com"))!.id;
});

const seed_red_bird = () =>
  seed_npo(t.db, { name: "Red Bird", registration_number: "EIN-RB" });

const invite = (npo_name: string, first = "Nichole") => ({
  invitee: INVITEE,
  invitee_first_name: first,
  invitor: "admin@test.com",
  npo_name,
});

describe("npo_admin_tx invites", () => {
  test("two nonprofits inviting the same email each get a pending invite", async () => {
    const a = (await seed_red_bird())!;
    const b = (await seed_npo(t.db, {
      name: "Blue Jay",
      registration_number: "EIN-BJ",
    }))!;

    await npo_admin_tx(as_db(t.db), a.id, invite("Red Bird"), invitor_id);
    await npo_admin_tx(as_db(t.db), b.id, invite("Blue Jay"), invitor_id);

    const rows = await t.db
      .select({ npo_id: user_invites.npo_id, npo_name: user_invites.npo_name })
      .from(user_invites)
      .orderBy(user_invites.npo_name);
    expect(rows).toEqual([
      { npo_id: b.id, npo_name: "Blue Jay" },
      { npo_id: a.id, npo_name: "Red Bird" },
    ]);
  });

  test("the same nonprofit re-inviting refreshes its one pending invite", async () => {
    const a = (await seed_red_bird())!;
    const stale = "2026-01-01T00:00:00.000Z";
    await t.db.insert(user_invites).values({
      invitee: INVITEE,
      invitee_first: "Nicole",
      invitor_id,
      npo_name: "Red Bird",
      npo_id: a.id,
      expire_at: stale,
    });
    const reinvitor_id = (await seed_user(t.db, "admin2@test.com"))!.id;

    const before = Date.now();
    await npo_admin_tx(
      as_db(t.db),
      a.id,
      invite("Red Bird Foundation", "Nichole"),
      reinvitor_id
    );

    const rows = await t.db.select().from(user_invites);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invitee: INVITEE,
      invitee_first: "Nichole",
      invitor_id: reinvitor_id,
      npo_name: "Red Bird Foundation",
      npo_id: a.id,
    });
    expect(Date.parse(rows[0]!.expire_at)).toBeGreaterThan(before);
  });
});

test("an invite with no nonprofit is rejected", async () => {
  await expect(
    t.client.query(
      `insert into user_invites (invitee, invitee_first, invitor_id, npo_name, npo_id, expire_at)
         values ($1, 'Nichole', $2, 'Red Bird', null, now())`,
      [INVITEE, invitor_id]
    )
  ).rejects.toMatchObject({ code: "23502", column: "npo_id" });
});
