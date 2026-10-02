import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { NPO_PUBLIC_KEYS } from "$/pg/queries/npo";
import { npos } from "$/pg/schema/npo";
import { programs } from "$/pg/schema/program";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

vi.mock("$/pg/db", () => ({
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

vi.mock("#/.server/auth", async () =>
  (await import("$/auth/test-utils")).make_auth_mock({
    session: { user: null },
  })
);

const { loader } = await import("./donate-loader");
const { create_test_db } = await import("$/pg/test-utils/pglite");

let counter = 0;

async function seed_npo(name: string) {
  counter++;
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number: `EIN-${counter}`,
      name,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
    })
    .returning();
  return row;
}

async function seed_program(npo_id: number, title: string) {
  const id = crypto.randomUUID();
  await test_db.current!.db.insert(programs).values({
    id,
    npo_id,
    title,
    description_pt: "{}",
    created_at: new Date().toISOString(),
  });
  return id;
}

async function load(npo_id: number, program_id?: string) {
  const qs = program_id ? `?programId=${program_id}` : "";
  const request = new Request(`https://x/donate/${npo_id}${qs}`);
  const res: any = await loader({
    request,
    params: { id: String(npo_id) },
  } as any);
  return res.data;
}

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(programs);
  await test_db.current!.db.delete(npos);
});

describe("donate loader program", () => {
  it("renders the npo's page without another npo's program", async () => {
    const recipient = await seed_npo("Recipient");
    const other = await seed_npo("Other");
    const foreign = await seed_program(other.id, "Other's Program");

    const d = await load(recipient.id, foreign);

    expect(d.endow.name).toBe("Recipient");
    expect(d.program).toBeUndefined();
  });

  it("keeps the npo's own program", async () => {
    const recipient = await seed_npo("Recipient");
    const own = await seed_program(recipient.id, "Own Program");

    const d = await load(recipient.id, own);

    expect(d.program).toMatchObject({ id: own, title: "Own Program" });
  });
});

describe("donate loader npo", () => {
  it("sends the npo's display fields and none of its private columns", async () => {
    const npo = await seed_npo("Recipient");
    await test_db
      .current!.db.update(npos)
      .set({
        liq: 1234,
        cash: 567,
        lock_units: 89,
        w_form: "w9-eid",
        referral_id: `REF-${npo.id}`,
        payout_minimum: 50,
      })
      .where(eq(npos.id, npo.id));

    const d = await load(npo.id);

    expect(d.endow).toMatchObject({ id: npo.id, name: "Recipient" });
    expect(Object.keys(d.endow).sort()).toEqual([...NPO_PUBLIC_KEYS].sort());
  });
});
