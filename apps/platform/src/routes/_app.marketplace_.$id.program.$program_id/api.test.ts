import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { npos } from "$/pg/schema/npo";
import { programs } from "$/pg/schema/program";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

import { loader } from "./api";

const A_PID = globalThis.crypto.randomUUID();
const B_PID = globalThis.crypto.randomUUID();
let npo_a: number;

beforeAll(async () => {
  const { create_test_db } = await import("$/pg/test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(npos);
  npo_a = (await seed_npo(db, { registration_number: "EIN-A" }))!.id;
  const npo_b = (await seed_npo(db, { registration_number: "EIN-B" }))!.id;
  await db.insert(programs).values([
    { id: A_PID, npo_id: npo_a, title: "A wells", description_pt: "[]" },
    { id: B_PID, npo_id: npo_b, title: "B wells", description_pt: "[]" },
  ]);
});

const load = (program_id: string) =>
  (loader as any)({ params: { id: String(npo_a), program_id } });

describe("marketplace program page", () => {
  it("shows a program on its own nonprofit's page", async () => {
    const prog = await load(A_PID);

    expect(prog).toMatchObject({ id: A_PID, title: "A wells" });
  });

  it("404s another nonprofit's program under this nonprofit's url", async () => {
    const thrown = await load(B_PID).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(404);
  });
});
