import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TestDb } from "../test-utils/pglite-browser";

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
import { create_test_db } from "../test-utils/pglite-browser";
import { reg_fsa_packet } from "./registration";

const SEEN_AT = "2026-08-24T10:00:00.000Z";
const PACKET = {
  o_fsa_signing_url: "https://anvil.test/sign",
  o_fsa_doc_eid: "docGroupNew",
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(registrations);
  await test_db.current!.db.insert(registrations).values({
    id: "r-1",
    r_id: "jane@test.com",
    status: "01",
    updated_at: SEEN_AT,
  });
});

const row = async () =>
  (
    await test_db
      .current!.db.select()
      .from(registrations)
      .where(eq(registrations.id, "r-1"))
  )[0]!;

describe("reg_fsa_packet", () => {
  test("writes onto the row the packet was generated from", async () => {
    const updated = await reg_fsa_packet("r-1", SEEN_AT, PACKET);

    expect(updated).toBeTruthy();
    expect((await row()).o_fsa_doc_eid).toBe("docGroupNew");
  });

  // anvil mints the packet over the network, so a reset has a window to commit
  // between the read that fed it and this write.
  test("refuses a row that moved on while the packet was minted", async () => {
    await test_db
      .current!.db.update(registrations)
      .set({ updated_at: "2026-08-24T10:00:01.000Z" })
      .where(eq(registrations.id, "r-1"));

    expect(await reg_fsa_packet("r-1", SEEN_AT, PACKET)).toBeUndefined();
    expect((await row()).o_fsa_doc_eid).toBeNull();
  });

  test("stamps its own updated_at, so the next packet needs the new one", async () => {
    await reg_fsa_packet("r-1", SEEN_AT, PACKET);

    expect((await row()).updated_at).not.toBe(SEEN_AT);
    expect(
      await reg_fsa_packet("r-1", SEEN_AT, { o_fsa_doc_eid: "docGroupTwo" })
    ).toBeUndefined();
  });
});
