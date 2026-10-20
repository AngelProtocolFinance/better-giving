import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { TOrgType, TStatus } from "@/reg/schema";
import type { TestDb } from "../test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

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

import { npos } from "../schema/npo";
import { registrations } from "../schema/registration";
import { create_test_db } from "../test-utils/pglite";
import { reg_public_ein } from "./registration";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(registrations);
  await db.delete(npos);
});

async function seed_npo(registration_number: string) {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number,
      name: "Public NPO",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning({ id: npos.id });
  return row!.id;
}

function seed_reg(row: {
  id: string;
  npo_id: number;
  status?: TStatus;
  o_type?: TOrgType;
  o_ein?: string | null;
  updated_at?: string;
}) {
  return test_db.current!.db.insert(registrations).values({
    id: row.id,
    r_id: `${row.id}@test.com`,
    status: row.status ?? "03",
    o_type: row.o_type,
    o_ein: row.o_ein,
    status_approved_npo_id: row.npo_id,
    updated_at: row.updated_at,
  });
}

describe("reg_public_ein", () => {
  test("returns the ein on the latest approved 501c3 registration", async () => {
    const npo_id = await seed_npo("99-0000001");
    await seed_reg({
      id: "older",
      npo_id,
      o_type: "501c3",
      o_ein: "11-1111111",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seed_reg({
      id: "newer",
      npo_id,
      o_type: "501c3",
      o_ein: "22-2222222",
      updated_at: "2026-06-01T00:00:00.000Z",
    });

    expect(await reg_public_ein(npo_id)).toEqual({ ein: "22-2222222" });
  });

  test("a later approved other registration hides an older 501c3 ein", async () => {
    const npo_id = await seed_npo("99-0000001");
    await seed_reg({
      id: "older",
      npo_id,
      o_type: "501c3",
      o_ein: "11-1111111",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    await seed_reg({
      id: "newer",
      npo_id,
      o_type: "other",
      o_ein: "22-2222222",
      updated_at: "2026-06-01T00:00:00.000Z",
    });

    expect(await reg_public_ein(npo_id)).toBeNull();
  });

  test.each([null, "", "   "])(
    "a later approved 501c3 with ein %j hides an older ein",
    async (o_ein) => {
      const npo_id = await seed_npo("99-0000001");
      await seed_reg({
        id: "older",
        npo_id,
        o_type: "501c3",
        o_ein: "11-1111111",
        updated_at: "2026-01-01T00:00:00.000Z",
      });
      await seed_reg({
        id: "newer",
        npo_id,
        o_type: "501c3",
        o_ein,
        updated_at: "2026-06-01T00:00:00.000Z",
      });

      expect(await reg_public_ein(npo_id)).toBeNull();
    }
  );

  test("padding around a 501c3 ein is not part of the public value", async () => {
    const npo_id = await seed_npo("99-0000001");
    await seed_reg({
      id: "padded",
      npo_id,
      o_type: "501c3",
      o_ein: "  22-2222222  ",
      updated_at: "2026-06-01T00:00:00.000Z",
    });

    expect(await reg_public_ein(npo_id)).toEqual({ ein: "22-2222222" });
  });

  test.each<TStatus>(["01", "02", "04"])(
    "a %s registration is not an approved one",
    async (status) => {
      const npo_id = await seed_npo("99-0000001");
      await seed_reg({
        id: "open",
        npo_id,
        status,
        o_type: "501c3",
        o_ein: "11-1111111",
        updated_at: "2026-06-01T00:00:00.000Z",
      });

      expect(await reg_public_ein(npo_id)).toBeNull();
    }
  );

  test("an approved row with no updated_at does not outrank a stamped one", async () => {
    const npo_id = await seed_npo("99-0000001");
    await seed_reg({
      id: "unstamped",
      npo_id,
      o_type: "501c3",
      o_ein: "11-1111111",
    });
    await seed_reg({
      id: "stamped",
      npo_id,
      o_type: "other",
      o_ein: "22-2222222",
      updated_at: "2026-06-01T00:00:00.000Z",
    });

    expect(await reg_public_ein(npo_id)).toBeNull();
  });

  test("an npo registration number is not an ein", async () => {
    const npo_id = await seed_npo("99-0000001");

    expect(await reg_public_ein(npo_id)).toBeNull();
  });

  test("another npo's approved ein stays on that npo", async () => {
    const theirs = await seed_npo("99-0000001");
    const ours = await seed_npo("88-0000002");
    await seed_reg({
      id: "theirs",
      npo_id: theirs,
      o_type: "501c3",
      o_ein: "11-1111111",
      updated_at: "2026-06-01T00:00:00.000Z",
    });

    expect(await reg_public_ein(ours)).toBeNull();
    expect(await reg_public_ein(theirs)).toEqual({ ein: "11-1111111" });
  });
});
