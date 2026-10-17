import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { user } from "$/pg/schema/auth";
import { npos } from "$/pg/schema/npo";
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
    session: { user: undefined },
  })
);

const { campaign_members, campaigns } = await import("$/pg/schema/campaign");
const { create_test_db } = await import("$/pg/test-utils/pglite");
const { loader } = await import("./api");

const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  const db = test_db.current!.db;
  await db.delete(campaign_members);
  await db.delete(campaigns);
  await db.delete(npos);
  await db.delete(user);
  await db.insert(user).values({
    id: USER,
    name: "Ada Admin",
    email: "ada-public@test.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    first_name: "Ada",
    last_name: "Admin",
  });
});

async function org(active = true) {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number: "EIN-PUBLIC",
      name: "Acme",
      slug: "acme",
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      active,
    })
    .returning();
  return row!;
}

async function campaign(
  npo_id: number,
  o: {
    id?: string;
    slug?: string;
    status?: "draft" | "live" | "ended";
    ends_at?: string | null;
  } = {}
) {
  const id = o.id ?? "camp-public";
  await test_db.current!.db.insert(campaigns).values({
    id,
    owner_npo_id: npo_id,
    creator_id: USER,
    name: "Winter drive",
    slug: o.slug ?? "winter",
    status: o.status ?? "live",
    ends_at: o.ends_at ?? null,
    description_pt: "[]",
    donate_methods: ["stripe"],
    donate_frequencies: ["one-time", "monthly"],
    published_at: "2026-01-01T00:00:00.000Z",
  });
  await test_db.current!.db.insert(campaign_members).values({
    campaign_id: id,
    npo_id,
  });
}

function load(url: string) {
  const u = new URL(url);
  return loader({
    request: new Request(url),
    params: {
      org: u.pathname.split("/")[2],
      campaign: u.pathname.split("/")[3],
    },
  } as any);
}

async function status_of(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(Response);
    return (err as Response).status;
  }
  expect.fail("expected a thrown response");
}

describe("public campaign page", () => {
  it("404s a draft and an unknown slug", async () => {
    const npo = await org();
    await campaign(npo.id, { status: "draft" });
    expect(await status_of(load("https://x/org/acme/winter"))).toBe(404);
    expect(await status_of(load("https://x/org/acme/missing"))).toBe(404);
  });

  it("returns a live campaign and ignores an invalid prefill", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load(
      "https://x/org/acme/winter?amount=nope&frequency=yearly"
    );
    expect(data.campaign.slug).toBe("winter");
    expect(data.closed).toBe(false);
    expect(data.prefill_amount_usd).toBeUndefined();
    expect(data.prefill_frequency).toBeUndefined();
  });

  it("prefills amount and frequency when both are valid for the campaign", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load(
      "https://x/org/acme/winter?amount=50&frequency=monthly"
    );
    expect(data.prefill_amount_usd).toBe("50");
    expect(data.prefill_frequency).toBe("monthly");
    expect(data.npo.id).toBe(npo.id);
  });

  it("marks an ended campaign and a live campaign past its end as closed", async () => {
    const npo = await org();
    await campaign(npo.id, { id: "ended", slug: "ended", status: "ended" });
    await campaign(npo.id, {
      id: "past",
      slug: "past",
      status: "live",
      ends_at: "2020-01-01T00:00:00.000Z",
    });
    const ended = await load("https://x/org/acme/ended");
    const past = await load("https://x/org/acme/past");
    expect(ended.closed).toBe(true);
    expect(past.closed).toBe(true);
  });
});
