import { eq } from "drizzle-orm";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { reset_rate_limits } from "#/.server/auth/rate-limit";
import { seed_fund, seed_npo, seed_user } from "#/__tests__/fixtures/funds";
import { OFFLINE_SOURCE, RECORDED_BY_HAND } from "@/donations/offline";
import { exchange_code, issue_code } from "$/connector/keys";
import {
  npo_admin_donations,
  recorded_by_hand_usd,
} from "$/pg/queries/admin-donations";
import { npo_donations } from "$/pg/queries/dist";
import type { DbOrTx } from "$/pg/queries/helpers";
import { npo_get } from "$/pg/queries/npo";
import { npo_payouts, npo_settlements } from "$/pg/queries/payout";
import { user } from "$/pg/schema/auth";
import { bal_txs } from "$/pg/schema/bal-tx";
import {
  connector_codes,
  connector_idempotency,
  connector_keys,
} from "$/pg/schema/connector";
import { donation_disputes } from "$/pg/schema/dispute";
import { dists } from "$/pg/schema/dist";
import {
  donation_donors,
  donation_recipients,
  donation_settlements,
  donations,
} from "$/pg/schema/donation";
import { forms } from "$/pg/schema/form";
import { funds } from "$/pg/schema/fund";
import { npos } from "$/pg/schema/npo";
import { payouts, settlements } from "$/pg/schema/payout";
import { subscriptions } from "$/pg/schema/subscription";
import { user_npo_memberships } from "$/pg/schema/user";
import type { TestDb } from "$/pg/test-utils/pglite";
import { create_test_db } from "$/pg/test-utils/pglite";
import { origin_text } from "./admin.$id.donations/helpers";
import { loader as catalog_loader } from "./connector.v1.blocks.catalog";
import {
  action as campaigns_action,
  loader as campaigns_loader,
} from "./connector.v1.campaigns";
import { loader as campaign_loader } from "./connector.v1.campaigns.$id";
import { loader as page_loader } from "./connector.v1.donation-page";
import {
  action as donations_action,
  loader as donations_loader,
} from "./connector.v1.donations";
import { loader as donors_loader } from "./connector.v1.donors";
import { loader as donor_loader } from "./connector.v1.donors.$id";
import { loader as forms_loader } from "./connector.v1.forms";
import { loader as form_loader } from "./connector.v1.forms.$id";
import { loader as recurring_loader } from "./connector.v1.recurring";
import { loader as results_loader } from "./connector.v1.results";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("$/pg/db", () => ({
  db: new Proxy({} as any, {
    get(_, prop) {
      return (test_db.current!.db as any)[prop];
    },
  }),
}));

const db = () => test_db.current!.db;
const as_db = (x: unknown) => x as DbOrTx;

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  reset_rate_limits();
  await db().delete(donation_disputes);
  await db().delete(dists);
  await db().delete(donations);
  await db().delete(subscriptions);
  await db().delete(forms);
  await db().delete(funds);
  await db().delete(connector_idempotency);
  await db().delete(connector_keys);
  await db().delete(connector_codes);
  await db().delete(user_npo_memberships);
  await db().delete(bal_txs);
  await db().delete(npos);
  await db().delete(user);
});

type Call = {
  request: Request;
  params: Record<string, string>;
  context: Record<string, never>;
  url: URL;
  pattern: string;
};

const call = (
  path: string,
  init: RequestInit = {},
  params: Record<string, string> = {}
): Call => {
  const request = new Request(`https://bg.test${path}`, init);
  return {
    request,
    params,
    context: {},
    url: new URL(request.url),
    pattern: path.split("?")[0] ?? path,
  };
};

const auth = (key?: string, extra?: Record<string, string>) => {
  const headers = new Headers(extra);
  if (key) headers.set("authorization", `Bearer ${key}`);
  return headers;
};

const get = (
  loader: (args: LoaderFunctionArgs) => Promise<Response> | Response,
  path: string,
  key?: string,
  params: Record<string, string> = {}
) =>
  loader(
    call(path, { headers: auth(key) }, params) as unknown as LoaderFunctionArgs
  ) as Promise<Response>;

const post = (
  action: (args: ActionFunctionArgs) => Promise<Response> | Response,
  path: string,
  key: string,
  body: unknown,
  idem?: string
) =>
  action(
    call(path, {
      method: "POST",
      headers: auth(key, {
        "content-type": "application/json",
        ...(idem ? { "idempotency-key": idem } : {}),
      }),
      body: JSON.stringify(body),
    }) as unknown as ActionFunctionArgs
  ) as Promise<Response>;

async function mint(npo_id: number, user_id: string) {
  const issued = await issue_code(as_db(db()), {
    npo_id,
    allowed_by: user_id,
    iss: "https://zap.example",
  });
  const exchanged = await exchange_code(as_db(db()), issued.code);
  if (!exchanged.ok) throw new Error("exchange failed");
  return exchanged.key;
}

async function pair(name: string, ein: string, email: string) {
  const npo = (await seed_npo(db(), {
    name,
    registration_number: ein,
  }))!;
  const owner = (await seed_user(db(), email, name, "Owner"))!;
  await db().insert(user_npo_memberships).values({
    user_id: owner.id,
    npo_id: npo.id,
  });
  const key = await mint(npo.id, owner.id);
  return { npo, owner, key };
}

async function insert_gift(vals: {
  id: string;
  npo_id?: number;
  fund_id?: string;
  email: string;
  name?: string;
  amount: number;
  status?: string;
  source?: string;
  via?: string;
  note?: string | null;
  created_at: string;
  frequency?: string;
}) {
  await db()
    .insert(donations)
    .values({
      id: vals.id,
      upusd: vals.amount,
      status: vals.status ?? "settled",
      amount_base: vals.amount,
      amount_tip: 0,
      amount_fee_allowance: 0,
      currency: "USD",
      frequency: vals.frequency ?? "one-time",
      source: vals.source ?? "bg-marketplace",
      note: vals.note ?? null,
      via: vals.via ?? "stripe:card",
      created_at: vals.created_at,
      updated_at: vals.created_at,
    });
  await db()
    .insert(donation_recipients)
    .values({
      donation_id: vals.id,
      npo_id: vals.fund_id ? null : vals.npo_id,
      fund_id: vals.fund_id ?? null,
      name: "Recipient",
      type: vals.fund_id ? "fund" : "npo",
    });
  await db()
    .insert(donation_donors)
    .values({
      donation_id: vals.id,
      email: vals.email,
      name: vals.name ?? "Donor",
    });
}

describe("campaign reads", () => {
  test("status precedence is ended, then draft, then published, with an absolute public url", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    const b = await pair("Beta", "EIN-B", "b@test.com");
    await seed_fund(db(), {
      id: "ended-inactive",
      name: "Ended",
      npo_owner: a.npo.id,
      creator_id: a.owner.id,
      active: false,
      expiration: "2020-01-15T00:00:00.000Z",
    });
    await seed_fund(db(), {
      id: "ended-active",
      name: "Expired live",
      npo_owner: a.npo.id,
      creator_id: a.owner.id,
      active: true,
      expiration: "2020-06-01T00:00:00.000Z",
    });
    await seed_fund(db(), {
      id: "draft-one",
      name: "Draft",
      npo_owner: a.npo.id,
      creator_id: a.owner.id,
      active: false,
    });
    await seed_fund(db(), {
      id: "live-one",
      name: "Live",
      npo_owner: a.npo.id,
      creator_id: a.owner.id,
      active: true,
      target_number: 1000,
      slug: "live-one",
    });
    await seed_fund(db(), {
      id: "other-live",
      name: "Other",
      npo_owner: b.npo.id,
      creator_id: b.owner.id,
      active: true,
    });

    const list = await get(campaigns_loader, "/connector/v1/campaigns", a.key);
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      data: {
        id: string;
        status: string;
        public_url: string | null;
        goal: { amount: string; currency: string } | null;
      }[];
      next_cursor: string | null;
    };
    const by_id = Object.fromEntries(body.data.map((row) => [row.id, row]));
    expect(by_id["ended-inactive"]?.status).toBe("ended");
    expect(by_id["ended-active"]?.status).toBe("ended");
    expect(by_id["draft-one"]?.status).toBe("draft");
    expect(by_id["live-one"]?.status).toBe("published");
    expect(by_id["other-live"]).toBeUndefined();
    expect(by_id["draft-one"]?.public_url).toBeNull();
    expect(by_id["ended-inactive"]?.public_url).toBe(
      "http://localhost:4200/fundraisers/ended-inactive"
    );
    expect(by_id["live-one"]?.public_url).toBe(
      "http://localhost:4200/fundraisers/live-one"
    );
    expect(by_id["live-one"]?.goal).toEqual({
      amount: "1000.00",
      currency: "USD",
    });

    const ended = await get(
      campaigns_loader,
      "/connector/v1/campaigns?status=ended",
      a.key
    );
    const ended_ids = (
      (await ended.json()) as { data: { id: string }[] }
    ).data.map((row) => row.id);
    expect(ended_ids.sort()).toEqual(["ended-active", "ended-inactive"]);

    const other = await get(
      campaign_loader,
      "/connector/v1/campaigns/live-one",
      b.key,
      { id: "live-one" }
    );
    expect(other.status).toBe(404);
    expect(await other.json()).toMatchObject({
      code: "not_found",
      status: 404,
    });

    const detail = await get(
      campaign_loader,
      "/connector/v1/campaigns/live-one",
      a.key,
      { id: "live-one" }
    );
    expect(detail.status).toBe(200);
    const campaign = (await detail.json()) as {
      blocks: { type: string }[];
      has_unpublished_changes: boolean;
      public_url: string;
    };
    expect(campaign.blocks.map((block) => block.type)).toEqual([
      "title",
      "story",
      "hero",
      "goal-bar",
    ]);
    expect(campaign.has_unpublished_changes).toBe(false);
    expect(campaign.public_url).toBe(
      "http://localhost:4200/fundraisers/live-one"
    );

    const bad = await get(
      campaigns_loader,
      "/connector/v1/campaigns?limit=101&extra=1",
      a.key
    );
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ code: "invalid", status: 422 });
  });
});

describe("donation page and catalog", () => {
  test("projects an absolute marketplace url and only the blocks it emits", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    await db()
      .update(npos)
      .set({
        slug: "red-bird",
        published: true,
        active: true,
        overview_v2: "A story",
        logo: "https://img.example/logo.png",
      })
      .where(eq(npos.id, a.npo.id));

    const page = await get(page_loader, "/connector/v1/donation-page", a.key);
    expect(page.status).toBe(200);
    const body = (await page.json()) as {
      status: string;
      public_url: string | null;
      has_unpublished_changes: boolean;
      blocks: { type: string; text?: string; image_url?: string | null }[];
    };
    expect(body.status).toBe("published");
    expect(body.public_url).toBe("http://localhost:4200/marketplace/red-bird");
    expect(body.has_unpublished_changes).toBe(false);
    expect(body.blocks.map((block) => block.type)).toEqual([
      "title",
      "story",
      "hero",
    ]);
    expect(body.blocks[2]?.image_url).toBe("https://img.example/logo.png");

    await db()
      .update(npos)
      .set({ published: false })
      .where(eq(npos.id, a.npo.id));
    const draft = (await (
      await get(page_loader, "/connector/v1/donation-page", a.key)
    ).json()) as { status: string; public_url: string | null };
    expect(draft.status).toBe("draft");
    expect(draft.public_url).toBeNull();

    const catalog = await get(
      catalog_loader,
      "/connector/v1/blocks/catalog",
      a.key
    );
    expect(catalog.status).toBe(200);
    const blocks = (
      (await catalog.json()) as { blocks: { type: string }[] }
    ).blocks.map((block) => block.type);
    expect(blocks).toEqual(["title", "story", "hero", "goal-bar"]);
  });
});

describe("forms", () => {
  test("maps ConnectorForm and includes a form attached to a page", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    const b = await pair("Beta", "EIN-B", "b@test.com");
    await seed_fund(db(), {
      id: "fund-a",
      npo_owner: a.npo.id,
      creator_id: a.owner.id,
      active: true,
    });
    await seed_fund(db(), {
      id: "fund-b",
      npo_owner: b.npo.id,
      creator_id: b.owner.id,
      active: true,
    });
    const outsider = (await seed_user(db(), "out@test.com", "Out", "Side"))!;
    await db()
      .insert(forms)
      .values([
        {
          id: "owned",
          owner_npo_id: a.npo.id,
          name: "Owned",
          status: "active",
          increments: [{ value: "25", label: "25" }],
          program_id: "prog_1",
          date_created: "2024-01-02T00:00:00.000Z",
        },
        {
          id: "on-page",
          owner_user_id: outsider.id,
          recipient_npo_id: a.npo.id,
          name: "On the page",
          status: null,
          date_created: "2024-01-03T00:00:00.000Z",
        },
        {
          id: "on-fund",
          owner_user_id: outsider.id,
          recipient_fund_id: "fund-a",
          name: "On the fund",
          status: "inactive",
          date_created: "2024-01-04T00:00:00.000Z",
        },
        {
          id: "foreign-fund",
          owner_npo_id: a.npo.id,
          recipient_fund_id: "fund-b",
          name: "Points away",
          status: "active",
          date_created: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "theirs",
          owner_npo_id: b.npo.id,
          name: "Theirs",
          status: "active",
          date_created: "2024-01-05T00:00:00.000Z",
        },
      ]);

    const list = await get(forms_loader, "/connector/v1/forms", a.key);
    expect(list.status).toBe(200);
    const data = (
      (await list.json()) as {
        data: {
          id: string;
          status: string;
          suggested_amounts: { amount: string; currency: string }[];
          minimum: unknown;
          maximum: unknown;
          allowed_origins: string[];
          gifts_go_to: { mode: string; program_id: string | null };
          campaign_id: string | null;
        }[];
      }
    ).data;
    const ids = data.map((row) => row.id);
    expect(ids).toContain("on-page");
    expect(ids).toContain("on-fund");
    expect(ids).not.toContain("theirs");
    const owned = data.find((row) => row.id === "owned");
    expect(owned).toMatchObject({
      status: "live",
      suggested_amounts: [{ amount: "25.00", currency: "USD" }],
      minimum: null,
      maximum: null,
      allowed_origins: [],
      gifts_go_to: { mode: "pinned", program_id: "prog_1" },
      campaign_id: null,
    });
    expect(data.find((row) => row.id === "on-page")?.status).toBe("draft");
    expect(data.find((row) => row.id === "on-fund")?.campaign_id).toBe(
      "fund-a"
    );
    expect(
      data.find((row) => row.id === "foreign-fund")?.campaign_id
    ).toBeNull();

    const missing = await get(
      form_loader,
      "/connector/v1/forms/theirs",
      a.key,
      {
        id: "theirs",
      }
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "not_found" });
  });
});

describe("donations, donors, results, recurring", () => {
  test("pages gifts, keeps a note on note, and hides the other nonprofit", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    const b = await pair("Beta", "EIN-B", "b@test.com");
    await seed_fund(db(), {
      id: "fund-a",
      name: "Drive",
      npo_owner: a.npo.id,
      creator_id: a.owner.id,
      active: true,
      target_number: 500,
    });
    await insert_gift({
      id: "g-new",
      npo_id: a.npo.id,
      email: "ada@example.com",
      name: "Ada",
      amount: 40,
      note: "for the library",
      source: OFFLINE_SOURCE,
      via: "cash",
      created_at: "2024-03-01T12:00:00.000Z",
    });
    await insert_gift({
      id: "g-mid",
      fund_id: "fund-a",
      email: "ada@example.com",
      name: "Ada",
      amount: 10,
      created_at: "2024-02-01T12:00:00.000Z",
    });
    await insert_gift({
      id: "g-old",
      npo_id: a.npo.id,
      email: "hand-old@recorded.invalid",
      name: "Walk-up",
      amount: 5,
      created_at: "2024-01-01T12:00:00.000Z",
    });
    await insert_gift({
      id: "g-refunded",
      npo_id: a.npo.id,
      email: "ada@example.com",
      amount: 99,
      status: "refunded",
      created_at: "2024-03-02T12:00:00.000Z",
    });
    await insert_gift({
      id: "g-other",
      npo_id: b.npo.id,
      email: "bea@example.com",
      amount: 1000,
      created_at: "2024-03-03T12:00:00.000Z",
    });

    const page = await get(
      donations_loader,
      "/connector/v1/donations?limit=2",
      a.key
    );
    expect(page.status).toBe(200);
    const first = (await page.json()) as {
      data: { id: string; note: string | null; campaign_id: string | null }[];
      next_cursor: string | null;
    };
    expect(first.data.map((row) => row.id)).toEqual(["g-new", "g-mid"]);
    expect(first.data[0]?.note).toBe("for the library");
    expect(first.data[0]?.campaign_id).toBeNull();
    expect(first.data[1]?.campaign_id).toBe("fund-a");
    expect(first.next_cursor).toBeTruthy();

    const second = await get(
      donations_loader,
      `/connector/v1/donations?limit=2&cursor=${encodeURIComponent(first.next_cursor!)}`,
      a.key
    );
    const rest = (await second.json()) as {
      data: { id: string }[];
      next_cursor: string | null;
    };
    expect(rest.data.map((row) => row.id)).toEqual(["g-old"]);
    expect(rest.next_cursor).toBeNull();

    const forged = await get(
      donations_loader,
      "/connector/v1/donations?cursor=not-a-cursor",
      a.key
    );
    expect(forged.status).toBe(422);

    const results = await get(results_loader, "/connector/v1/results", a.key);
    const summary = (await results.json()) as {
      total: { amount: string };
      gift_count: number;
      donor_count: number;
      campaigns: {
        id: string;
        total: { amount: string };
        gift_count: number;
        goal: { amount: string } | null;
      }[];
    };
    expect(summary.total.amount).toBe("55.00");
    expect(summary.gift_count).toBe(3);
    expect(summary.donor_count).toBe(2);
    const drive = summary.campaigns.find((row) => row.id === "fund-a");
    expect(drive?.total.amount).toBe("10.00");
    expect(drive?.gift_count).toBe(1);
    expect(drive?.goal?.amount).toBe("500.00");

    const hidden = await get(
      results_loader,
      "/connector/v1/results?campaign_id=fund-a",
      b.key
    );
    expect(hidden.status).toBe(404);

    const donors = await get(
      donors_loader,
      "/connector/v1/donors?q=ada",
      a.key
    );
    const donor_rows = (
      (await donors.json()) as {
        data: { id: string; email: string | null; gift_count: number }[];
      }
    ).data;
    expect(donor_rows).toHaveLength(1);
    expect(donor_rows[0]).toMatchObject({
      id: "ada@example.com",
      email: "ada@example.com",
      gift_count: 2,
    });

    const one = await get(
      donor_loader,
      "/connector/v1/donors/ada@example.com",
      a.key,
      { id: "ada@example.com" }
    );
    expect(one.status).toBe(200);
    const detail = (await one.json()) as {
      consent: string;
      gifts: { data: { note: string | null }[] };
    };
    expect(detail.consent).toBe("unasked");
    expect(
      detail.gifts.data.some((gift) => gift.note === "for the library")
    ).toBe(true);

    const stranger = await get(
      donor_loader,
      "/connector/v1/donors/bea@example.com",
      a.key,
      { id: "bea@example.com" }
    );
    expect(stranger.status).toBe(404);

    await db()
      .insert(subscriptions)
      .values([
        {
          id: "sub-month",
          interval: "month",
          interval_count: 1,
          next_billing: "2026-11-01T00:00:00.000Z",
          amount: 20,
          amount_usd: 20,
          currency: "USD",
          product_id: "price_month",
          to_npo_id: a.npo.id,
          to_name: "Alpha",
          platform: "stripe",
          status: "active",
          from_id: "Ada@Example.com",
          created_at: "2024-05-01T00:00:00.000Z",
          updated_at: "2024-05-02T00:00:00.000Z",
        },
        {
          id: "sub-year",
          interval: "year",
          interval_count: 1,
          next_billing: "2026-01-01T00:00:00.000Z",
          amount: 100,
          amount_usd: 100,
          currency: "EUR",
          product_id: "price_year",
          to_fund_id: "fund-a",
          to_name: "Drive",
          platform: "paypal",
          status: "inactive",
          from_id: "ada@example.com",
          created_at: "2024-04-01T00:00:00.000Z",
          updated_at: "2024-04-02T00:00:00.000Z",
        },
        {
          id: "sub-week",
          interval: "week",
          interval_count: 1,
          next_billing: "2026-10-01T00:00:00.000Z",
          amount: 5,
          amount_usd: 5,
          currency: "USD",
          product_id: "price_week",
          to_npo_id: a.npo.id,
          to_name: "Alpha",
          platform: "stripe",
          status: "active",
          from_id: "week@example.com",
          created_at: "2024-03-01T00:00:00.000Z",
          updated_at: "2024-03-02T00:00:00.000Z",
        },
        {
          id: "sub-b",
          interval: "month",
          interval_count: 1,
          next_billing: "2026-11-01T00:00:00.000Z",
          amount: 9,
          amount_usd: 9,
          currency: "USD",
          product_id: "price_b",
          to_npo_id: b.npo.id,
          to_name: "Beta",
          platform: "stripe",
          status: "active",
          from_id: "bea@example.com",
          created_at: "2024-06-01T00:00:00.000Z",
          updated_at: "2024-06-02T00:00:00.000Z",
        },
      ]);

    const recurring = await get(
      recurring_loader,
      "/connector/v1/recurring",
      a.key
    );
    const plans = (
      (await recurring.json()) as {
        data: {
          id: string;
          frequency: string;
          status: string;
          currency: string;
          next_charge_at: string | null;
          donor_id: string;
        }[];
      }
    ).data;
    expect(plans.map((row) => row.id)).not.toContain("sub-b");
    expect(plans.find((row) => row.id === "sub-month")).toMatchObject({
      frequency: "monthly",
      status: "active",
      currency: "USD",
      donor_id: "ada@example.com",
    });
    expect(plans.find((row) => row.id === "sub-year")).toMatchObject({
      frequency: "yearly",
      status: "stopped",
      next_charge_at: null,
    });
    expect(plans.find((row) => row.id === "sub-week")?.frequency).toBe(
      "monthly"
    );
  });

  test("a full page stays under 1 MiB and limit 100 is the ceiling", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    const note = "n".repeat(400);
    for (let i = 0; i < 100; i++) {
      await insert_gift({
        id: `bulk-${i}`,
        npo_id: a.npo.id,
        email: `p${i}@example.com`,
        amount: 1,
        note,
        created_at: new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
      });
    }
    const res = await get(
      donations_loader,
      "/connector/v1/donations?limit=100",
      a.key
    );
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text.length).toBeLessThan(1024 * 1024);
    expect(text.length).toBeLessThan(256 * 1024);

    const too_big = await get(
      donations_loader,
      "/connector/v1/donations?limit=101",
      a.key
    );
    expect(too_big.status).toBe(422);
  });
});

describe("writes", () => {
  test("create_campaign is a draft and replays on the same key", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    const b = await pair("Beta", "EIN-B", "b@test.com");
    const created = await post(
      campaigns_action,
      "/connector/v1/campaigns",
      a.key,
      { title: "  Library drive  " },
      "idem-1"
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      id: string;
      title: string;
      status: string;
      public_url: string | null;
    };
    expect(body).toMatchObject({
      title: "Library drive",
      status: "draft",
      public_url: null,
    });

    const again = await post(
      campaigns_action,
      "/connector/v1/campaigns",
      a.key,
      { title: "  Library drive  " },
      "idem-1"
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(body);
    expect(await db().select().from(funds)).toHaveLength(1);
    const [row] = await db().select().from(funds);
    expect(row?.active).toBe(false);
    expect(row?.npo_owner).toBe(a.npo.id);

    const clash = await post(
      campaigns_action,
      "/connector/v1/campaigns",
      a.key,
      { title: "Something else" },
      "idem-1"
    );
    expect(clash.status).toBe(409);
    expect(await clash.json()).toMatchObject({
      code: "idempotency_conflict",
      status: 409,
    });
    expect(await db().select().from(funds)).toHaveLength(1);

    const named = await post(
      campaigns_action,
      "/connector/v1/campaigns",
      a.key,
      { name: "Nope", campaign_type: "event" },
      "idem-2"
    );
    expect(named.status).toBe(422);

    const missing = await post(
      campaigns_action,
      "/connector/v1/campaigns",
      a.key,
      { title: "No key" }
    );
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({
      code: "idempotency_key_required",
      status: 400,
    });

    const hidden = await get(
      campaign_loader,
      `/connector/v1/campaigns/${body.id}`,
      b.key,
      { id: body.id }
    );
    expect(hidden.status).toBe(404);
    const visible = await get(
      campaigns_loader,
      "/connector/v1/campaigns",
      b.key
    );
    expect(((await visible.json()) as { data: unknown[] }).data).toEqual([]);
  });

  test("record_donation stores the note, refuses a campaign, and stays out of the ledger", async () => {
    const a = await pair("Alpha", "EIN-A", "a@test.com");
    const before = (
      await db()
        .select({ liq: npos.liq })
        .from(npos)
        .where(eq(npos.id, a.npo.id))
    )[0]?.liq;
    const body = {
      amount: { amount: "25.00", currency: "USD" },
      date: "2024-05-01",
      donor: { name: "Ada Lovelace", email: "Ada@Example.com" },
      method: "cash",
      note: "for the library",
    };
    const created = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      body,
      "gift-1"
    );
    expect(created.status).toBe(201);
    const gift = (await created.json()) as {
      id: string;
      note: string | null;
      campaign_id: string | null;
      method: string;
      frequency: string;
      donor_email: string | null;
      donor_id: string;
      status: string;
    };
    expect(gift.note).toBe("for the library");
    expect(gift.campaign_id).toBeNull();
    expect(gift.method).toBe("cash");
    expect(gift.frequency).toBe("one_time");
    expect(gift.donor_email).toBe("ada@example.com");
    expect(gift.donor_id).toBe("ada@example.com");
    expect(gift.status).toBe("settled");

    const again = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      body,
      "gift-1"
    );
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(gift);
    expect(await db().select().from(donations)).toHaveLength(1);

    const clash = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      { ...body, note: "different" },
      "gift-1"
    );
    expect(clash.status).toBe(409);
    expect(await db().select().from(donations)).toHaveLength(1);

    const [row] = await db().select().from(donations);
    expect(row?.source).toBe(OFFLINE_SOURCE);
    expect(row?.note).toBe("for the library");
    expect(row?.receipt_sent_at).toBeNull();
    expect(row?.source).not.toContain("library");

    const tied = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      { ...body, campaign_id: null },
      "gift-2"
    );
    expect(tied.status).toBe(422);
    expect(await db().select().from(donations)).toHaveLength(1);

    const later = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      { ...body, method: "check", note: "second" },
      "gift-2"
    );
    expect(later.status).toBe(201);

    const walkup = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      {
        amount: "10.50",
        date: "2024-05-02",
        donor: { name: "Walk up" },
        method: "check",
      },
      "gift-3"
    );
    expect(walkup.status).toBe(201);
    const hand = (await walkup.json()) as {
      donor_email: string | null;
      donor_id: string;
      note: string | null;
    };
    expect(hand.donor_email).toBeNull();
    expect(hand.note).toBeNull();
    expect(hand.donor_id.startsWith("hand-")).toBe(true);

    expect(await db().select().from(donation_settlements)).toEqual([]);
    expect(await db().select().from(dists)).toEqual([]);
    expect(await db().select().from(bal_txs)).toEqual([]);
    expect(await db().select().from(settlements)).toEqual([]);
    expect(await db().select().from(payouts)).toEqual([]);
    const after = (
      await db()
        .select({ liq: npos.liq })
        .from(npos)
        .where(eq(npos.id, a.npo.id))
    )[0]?.liq;
    expect(after).toBe(before);

    const ledger = await npo_donations(a.npo.id, { limit: 20 });
    expect(ledger.items).toEqual([]);
    const admin = await npo_admin_donations(a.npo.id, { limit: 20 });
    expect(admin.items.map((item) => item.source)).toContain(OFFLINE_SOURCE);
    expect(origin_text(OFFLINE_SOURCE)).toBe(RECORDED_BY_HAND);
    expect(await recorded_by_hand_usd(a.npo.id)).toBe(60.5);

    const npo = await npo_get(a.npo.id);
    expect(npo?.contributions_total).toBe(0);
    expect(npo?.liq).toBe(before);
    expect((await npo_settlements(a.npo.id, { limit: 10 })).items).toEqual([]);
    expect((await npo_payouts(a.npo.id, { limit: 10 })).items).toEqual([]);

    const future = await post(
      donations_action,
      "/connector/v1/donations",
      a.key,
      { ...body, date: "2999-01-01", method: "bank_transfer" },
      "gift-4"
    );
    expect(future.status).toBe(422);
  });
});
