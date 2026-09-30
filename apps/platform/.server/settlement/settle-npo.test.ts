import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import type { IInput } from "@/types/donation-dist";
import type { DbOrTx } from "../pg/queries/helpers";
import * as schema from "../pg/schema";
import { create_test_db, type TestDb } from "../pg/test-utils/pglite";

vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

const { settle_npo } = await import("./settle-npo");

let test_db: TestDb;

beforeAll(async () => {
  test_db = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db?.client.close();
});

describe("settle_npo", () => {
  // the plan's bal_begin/bal_end come from this read: unlocked, two concurrent
  // settlements of one npo both plan from the same balance
  test("reads the npo it plans from under a row lock", async () => {
    // an inactive npo returns right after the read, so no full input is needed
    const npo = await seed_npo(test_db.db, { active: false });
    const queries: string[] = [];
    const logged = drizzle(test_db.client, {
      schema,
      logger: { logQuery: (q) => queries.push(q) },
    });
    const input = { id: npo!.id, prnt: { id: "no-such-donation" } } as IInput;

    await logged.transaction((tx) =>
      settle_npo(tx as unknown as DbOrTx, input)
    );

    const npo_read = queries.find((q) => /from "npos"/.test(q));
    expect(npo_read).toMatch(/for no key update/);
  });
});
