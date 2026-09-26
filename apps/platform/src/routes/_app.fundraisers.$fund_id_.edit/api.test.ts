import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { seed_fund, seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { user } from "$/pg/schema/auth";
import { fund_members, funds } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
import { user_fund_memberships, user_npo_memberships } from "$/pg/schema/user";
import type { TestDb } from "$/pg/test-utils/pglite";

// --- mocks (hoisted) ---

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const session = vi.hoisted(() => ({ user: null as any }));

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
vi.mock("#/.server/auth", async () => ({
  ...(await import("$/auth/test-utils")).make_auth_mock(),
  get_session: vi.fn(async () => session),
}));
vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
  dataWithError: vi.fn((_d: unknown, msg: string) => ({ error: msg })),
}));

// --- imports (after mocks hoisted) ---

import { fund_get_or_slug } from "$/pg/queries/fund";
import { create_test_db } from "$/pg/test-utils/pglite";
import { action, loader } from "./api";

const db = () => test_db.current!.db;

const FUND_ID = "7f1c3b1e-6a55-4c1e-9d7e-3f2a1b0c9d8e";
const url = `https://app.test/fundraisers/${FUND_ID}/edit`;

const call_action = (body: object) =>
  (action as any)({
    request: new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    params: { fund_id: FUND_ID },
    context: {},
  });

const call_loader = () =>
  (loader as any)({
    request: new Request(url),
    params: { fund_id: FUND_ID },
    context: {},
  });

async function seed(o: { npo_owned?: boolean } = {}) {
  const { npo_owned = true } = o;
  const owner_npo = await seed_npo(db());
  const creator = await seed_user(db(), "creator@test.com");
  const stranger = await seed_user(db(), "stranger@test.com");
  const npo_member = await seed_user(db(), "member@test.com");
  await seed_fund(db(), {
    id: FUND_ID,
    name: "Original",
    npo_owner: npo_owned ? owner_npo.id : null,
    creator_id: creator.id,
  });
  await db()
    .insert(user_npo_memberships)
    .values({ user_id: npo_member.id, npo_id: owner_npo.id });
  await db()
    .insert(user_fund_memberships)
    .values({ user_id: creator.id, fund_id: FUND_ID });
  return { creator, stranger, npo_member };
}

const as = (u: { id: string; email: string }, role = "user") => {
  session.user = { ...u, role };
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await db().delete(user_fund_memberships);
  await db().delete(user_npo_memberships);
  await db().delete(fund_members);
  await db().delete(funds);
  await db().delete(npos);
  await db().delete(user);
});

describe("fundraiser edit authorization", () => {
  it("the loader refuses a signed-in user with no membership", async () => {
    const { stranger } = await seed();
    as(stranger);

    await expect(call_loader()).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a stranger closing the fund with the loader's 403", async () => {
    const { stranger } = await seed();
    as(stranger);

    await expect(call_action({ close: true })).rejects.toMatchObject({
      status: 403,
    });
    expect((await fund_get_or_slug(FUND_ID))?.active).toBe(true);
  });

  it("refuses a stranger rewriting the fund with the loader's 403", async () => {
    const { stranger } = await seed();
    as(stranger);

    await expect(call_action({ name: "Hijacked" })).rejects.toMatchObject({
      status: 403,
    });
    expect((await fund_get_or_slug(FUND_ID))?.name).toBe("Original");
  });

  it("refuses a stranger on a fund no nonprofit owns", async () => {
    const { stranger } = await seed({ npo_owned: false });
    as(stranger);

    await expect(call_action({ close: true })).rejects.toMatchObject({
      status: 403,
    });
    expect((await fund_get_or_slug(FUND_ID))?.active).toBe(true);
  });

  it("lets a platform admin with no membership close the fund", async () => {
    const { stranger } = await seed();
    as(stranger, "admin");

    await call_action({ close: true });

    expect((await fund_get_or_slug(FUND_ID))?.active).toBe(false);
  });

  it("lets a fund member rename the fund", async () => {
    const { creator } = await seed();
    as(creator);

    await call_action({ name: "Renamed" });

    expect((await fund_get_or_slug(FUND_ID))?.name).toBe("Renamed");
  });

  it("lets a member of the owning nonprofit close the fund", async () => {
    const { npo_member } = await seed();
    as(npo_member);

    await call_action({ close: true });

    expect((await fund_get_or_slug(FUND_ID))?.active).toBe(false);
  });
});
