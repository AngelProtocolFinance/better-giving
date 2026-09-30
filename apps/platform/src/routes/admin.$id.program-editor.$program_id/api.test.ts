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

// --- mocks (hoisted) ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));
vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock()
);
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ success: msg })),
  dataWithError: vi.fn((_d: unknown, msg: string) => ({ error: msg })),
}));

// --- imports (after mocks hoisted) ---

import { admin_ctx } from "#/.server/auth";
import { action } from "./api";

const PID = globalThis.crypto.randomUUID();
const GONE_MID = globalThis.crypto.randomUUID();
let own: number;

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
  own = (await seed_npo(db, { registration_number: "EIN-EDITOR" }))!.id;
  await db
    .insert(programs)
    .values({ id: PID, npo_id: own, title: "Wells", description_pt: "[]" });
});

const call = (body: object) =>
  (action as any)({
    request: new Request(
      `https://app.test/admin/${own}/program-editor/${PID}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }
    ),
    params: { id: String(own), program_id: PID },
    context: { get: (k: unknown) => (k === admin_ctx ? own : undefined) },
  });

describe("a milestone gone since the page loaded", () => {
  it("answers delete with an error toast the page revalidates under", async () => {
    const res = await call({
      intent: "delete-milestone",
      "milestone-id": GONE_MID,
    });

    expect(res).toEqual({ error: expect.stringMatching(/no longer exists/i) });
  });

  it("answers edit with an error toast the page revalidates under", async () => {
    const res = await call({
      intent: "edit-milestone",
      "milestone-id": GONE_MID,
      title: "Dug",
      description_pt: "[]",
    });

    expect(res).toEqual({ error: expect.stringMatching(/no longer exists/i) });
  });
});
