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

import { registrations } from "../schema/registration";
import { create_test_db } from "../test-utils/pglite-browser";
import { is_fsa_doc_eid } from "./registration";

const EID = "docGroupAbc123";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(registrations);
});

async function seed(
  id: string,
  cols: { o_fsa_doc_eid?: string; o_fsa_signed_doc_url?: string }
) {
  await test_db.current!.db.insert(registrations).values({
    id,
    r_id: `${id}@test.com`,
    status: "01",
    ...cols,
  });
}

describe("is_fsa_doc_eid", () => {
  test("the eid stamped at packet creation is recognised", async () => {
    // no webhook has landed, so the row carries no download url — and the
    // success page still resolves.
    await seed("r-1", { o_fsa_doc_eid: EID });

    expect(await is_fsa_doc_eid(EID)).toBe(true);
  });

  test("a row that predates the column still matches off its url", async () => {
    await seed("r-1", {
      o_fsa_signed_doc_url: `https://app.test/api/anvil-doc/${EID}`,
    });

    expect(await is_fsa_doc_eid(EID)).toBe(true);
  });

  test("an eid we hold no record of is refused", async () => {
    await seed("r-1", { o_fsa_doc_eid: "someOtherGroup" });

    expect(await is_fsa_doc_eid(EID)).toBe(false);
  });

  test("a `like` metacharacter matches nothing but itself", async () => {
    // unescaped, `%` would match every row that has ever signed one.
    await seed("r-1", {
      o_fsa_signed_doc_url: "https://app.test/api/anvil-doc/realEid",
    });

    expect(await is_fsa_doc_eid("%")).toBe(false);
  });
});
