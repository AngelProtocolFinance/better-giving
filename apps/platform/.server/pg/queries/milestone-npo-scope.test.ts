import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { seed_npo } from "#/__tests__/fixtures/funds";
import { npos } from "../schema/npo";
import { milestones, programs } from "../schema/program";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("../db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

const { milestone_delete, milestone_put, milestone_update, npo_program_get } =
  await import("./program");

const PID = "prog-1";
const MID = "ms-1";
let own: number;
let other: number;

beforeAll(async () => {
  const { create_test_db } = await import("../test-utils/pglite");
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(npos);
  own = (await seed_npo(db, { registration_number: "EIN-OWN" }))!.id;
  other = (await seed_npo(db, { registration_number: "EIN-OTHER" }))!.id;
  await db
    .insert(programs)
    .values({ id: PID, npo_id: own, title: "Wells", description_pt: "[]" });
  await db
    .insert(milestones)
    .values({ id: MID, program_id: PID, title: "Dig", description_pt: "[]" });
});

const milestone_rows = () =>
  test_db
    .current!.db.select({ id: milestones.id, title: milestones.title })
    .from(milestones)
    .where(eq(milestones.program_id, PID));

const NEW = {
  title: "Pump",
  description_pt: "[]",
  date: new Date().toISOString(),
};

describe("npo-scoped program read", () => {
  test("the owning npo reads its program with milestones", async () => {
    const prog = await npo_program_get(PID, own);
    expect(prog?.id).toBe(PID);
    expect(prog?.milestones).toHaveLength(1);
  });

  test("another npo reads nothing", async () => {
    expect(await npo_program_get(PID, other)).toBeUndefined();
  });
});

describe("milestone writes", () => {
  test("the owning npo adds a milestone", async () => {
    expect(await milestone_put(own, PID, NEW)).toEqual(expect.any(String));
    expect(await milestone_rows()).toHaveLength(2);
  });

  test("another npo adds nothing to the program", async () => {
    expect(await milestone_put(other, PID, NEW)).toBeUndefined();
    expect(await milestone_rows()).toHaveLength(1);
  });

  test("a program that no longer exists gets no milestone, and no fk error", async () => {
    expect(await milestone_put(own, "gone", NEW)).toBeUndefined();
  });

  test("the owning npo edits its milestone", async () => {
    expect(await milestone_update(own, PID, MID, { title: "Drill" })).toBe(
      true
    );
    expect(await milestone_rows()).toEqual([{ id: MID, title: "Drill" }]);
  });

  test("another npo edits nothing", async () => {
    expect(await milestone_update(other, PID, MID, { title: "Drill" })).toBe(
      false
    );
    expect(await milestone_rows()).toEqual([{ id: MID, title: "Dig" }]);
  });

  test("the owning npo deletes its milestone", async () => {
    expect(await milestone_delete(own, PID, MID)).toBe(true);
    expect(await milestone_rows()).toEqual([]);
  });

  test("another npo deletes nothing", async () => {
    expect(await milestone_delete(other, PID, MID)).toBe(false);
    expect(await milestone_rows()).toHaveLength(1);
  });
});
