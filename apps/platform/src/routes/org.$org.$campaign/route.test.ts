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
import { user } from "$/pg/schema/auth";
import { npos } from "$/pg/schema/npo";
import { registrations } from "$/pg/schema/registration";
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
const { donation_donors, donations } = await import("$/pg/schema/donation");
const { donation_messages } = await import("$/pg/schema/donation-message");
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
  await db.delete(donation_messages);
  await db.delete(donation_donors);
  await db.delete(donations);
  await db.delete(campaign_members);
  await db.delete(campaigns);
  await db.delete(registrations);
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

async function org(active = true, url: string | null = null) {
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
      url,
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
    campaign_type?: "monthly";
    donate_frequencies?: ("one-time" | "monthly")[];
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
    campaign_type: o.campaign_type,
    donate_methods: ["stripe"],
    donate_frequencies: o.donate_frequencies ?? ["one-time", "monthly"],
    published_at: "2026-01-01T00:00:00.000Z",
  });
  await test_db.current!.db.insert(campaign_members).values({
    campaign_id: id,
    npo_id,
  });
}

async function gift(o: {
  id: string;
  email: string;
  status: string;
  name: string;
  campaign_id?: string;
  with_donor?: boolean;
}) {
  const db = test_db.current!.db;
  await db.insert(donations).values({
    id: o.id,
    upusd: 40,
    status: o.status,
    amount_base: 40,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe",
    campaign_id: o.campaign_id ?? "camp-public",
  });
  if (o.with_donor !== false) {
    await db.insert(donation_donors).values({
      donation_id: o.id,
      email: o.email,
      name: o.name,
    });
  }
  await db.insert(donation_messages).values({
    id: `msg-${o.id}`,
    donation_id: o.id,
    donor_name: o.name,
  });
}

function email_keys(value: unknown): string[] {
  if (value == null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(email_keys);
  return Object.entries(value).flatMap(([key, child]) =>
    key === "email" ? [key] : email_keys(child)
  );
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
    expect(data.donor_count).toBe(0);
  });

  it("defaults a monthly campaign to monthly unless the query asks otherwise", async () => {
    const npo = await org();
    await campaign(npo.id, { campaign_type: "monthly" });
    const monthly = await load("https://x/org/acme/winter");
    expect(monthly.prefill_frequency).toBe("monthly");
    const once = await load("https://x/org/acme/winter?frequency=one-time");
    expect(once.prefill_frequency).toBe("one-time");
    await campaign(npo.id, {
      id: "once-only",
      slug: "once-only",
      campaign_type: "monthly",
      donate_frequencies: ["one-time"],
    });
    const blocked = await load("https://x/org/acme/once-only");
    expect(blocked.prefill_frequency).toBeUndefined();
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

  it("counts distinct settled donors and skips an unfinished gift", async () => {
    const npo = await org();
    await campaign(npo.id);
    const db = test_db.current!.db;
    async function gift(id: string, email: string, status: string) {
      await db.insert(donations).values({
        id,
        upusd: 10,
        status,
        amount_base: 10,
        amount_tip: 0,
        amount_fee_allowance: 0,
        currency: "USD",
        frequency: "one-time",
        source: "bg-marketplace",
        via: "stripe",
        campaign_id: "camp-public",
      });
      await db.insert(donation_donors).values({ donation_id: id, email });
    }
    await gift("g1", "Ada@test.com", "settled");
    await gift("g2", "ada@test.com", "settled");
    await gift("g3", "Bea@test.com", "settled");
    await gift("g4", "Cara@test.com", "intent");
    const data = await load("https://x/org/acme/winter");
    expect(data.donor_count).toBe(2);
  });

  it("returns no ein and no website when the nonprofit has no registration", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load("https://x/org/acme/winter");
    expect(data.npo.ein).toBeNull();
    expect(data.npo.url).toBeNull();
    expect(data.thanks_amount).toBeNull();
    expect(data.thanks_name).toBeNull();
  });

  it("returns the approved 501(c)(3) ein and the nonprofit website", async () => {
    const npo = await org(true, "https://acme.example/give");
    await campaign(npo.id);
    await test_db.current!.db.insert(registrations).values({
      id: "approved",
      r_id: "approved@test.com",
      status: "03",
      o_type: "501c3",
      o_ein: "22-2222222",
      status_approved_npo_id: npo.id,
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    const data = await load("https://x/org/acme/winter");
    expect(data.npo.ein).toBe("22-2222222");
    expect(data.npo.url).toBe("https://acme.example/give");
    expect(data.npo).not.toHaveProperty("registration_number");
    expect(data.npo).not.toHaveProperty("tagline");
  });

  it("reads a finished gift from the return query without counting it", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada"
    );
    expect(data.thanks_amount).toBe("$100");
    expect(data.thanks_name).toBe("Ada");
    expect(data.donor_count).toBe(0);
    expect(data.campaign.raised).toBe(0);
  });

  it("formats a non-USD gift as the amount plus its currency code", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load(
      "https://x/org/acme/winter?donation_amount=40&donation_currency=EUR"
    );
    expect(data.thanks_amount).toBe("40 EUR");
    expect(data.thanks_name).toBe("You");
    expect(data.thanks_usd).toBeNull();
    expect(data.thanks_settled).toBe(false);
  });

  it("formats a gift with no currency as dollars and a blank name as You", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load(
      "https://x/org/acme/winter?donation_amount=25&donor_name=%20"
    );
    expect(data.thanks_amount).toBe("$25");
    expect(data.thanks_name).toBe("You");
    expect(data.thanks_usd).toBe(25);
    expect(data.thanks_settled).toBe(false);
  });

  it("ignores a gift amount that is not a positive number", async () => {
    const npo = await org();
    await campaign(npo.id);
    const data = await load(
      "https://x/org/acme/winter?donation_amount=0&donation_currency=USD&donor_name=Ada"
    );
    expect(data.thanks_amount).toBeNull();
    expect(data.thanks_name).toBeNull();
  });

  it("reports an unsettled thanks gift when no settled usd gift matches", async () => {
    const npo = await org();
    await campaign(npo.id);
    const db = test_db.current!.db;
    async function gift(
      id: string,
      status: string,
      currency: string,
      amount: number,
      donor_name: string
    ) {
      await db.insert(donations).values({
        id,
        upusd: amount,
        status,
        amount_base: amount,
        amount_tip: 0,
        amount_fee_allowance: 0,
        currency,
        frequency: "one-time",
        source: "bg-marketplace",
        via: "stripe",
        campaign_id: "camp-public",
      });
      await db.insert(donation_messages).values({
        id: `msg-${id}`,
        donation_id: id,
        donor_name,
      });
    }
    await gift("intent-ada", "intent", "USD", 100, "Ada");
    await gift("settled-bea", "settled", "USD", 100, "Bea");
    await gift("settled-eur", "settled", "EUR", 100, "Ada");
    await gift("settled-other", "settled", "USD", 40, "Ada");
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada"
    );
    expect(data.thanks_usd).toBe(100);
    expect(data.thanks_settled).toBe(false);
    expect(data.donor_count).toBe(0);
    expect(data.campaign.raised).toBe(0);
  });

  it("counts the same email once when an earlier gift on this campaign already settled", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "prior-ada",
      email: "Ada@test.com",
      status: "settled",
      name: "Not Ada",
    });
    await gift({
      id: "current-ada",
      email: " ada@test.com ",
      status: "intent",
      name: "Ada",
    });
    const url =
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=current-ada";
    const again = await load(url);
    expect(again.thanks_repeat).toBe(true);
    expect(again.thanks_name).toBe("Ada");
    expect(again.thanks_settled).toBe(false);
    await test_db
      .current!.db.update(donation_donors)
      .set({ email: "bea@test.com" })
      .where(eq(donation_donors.donation_id, "current-ada"));
    const other = await load(url);
    expect(other.thanks_repeat).toBe(false);
  });

  it("counts two donors who share a display name", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "ada-one",
      email: "ada.one@test.com",
      status: "settled",
      name: "Ada",
    });
    await gift({
      id: "ada-two",
      email: "ada.two@test.com",
      status: "intent",
      name: "Ada",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=ada-two"
    );
    expect(data.thanks_repeat).toBe(false);
  });

  it("counts two Anonymous givers separately", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "anon-one",
      email: "anon.one@test.com",
      status: "settled",
      name: "Anonymous",
    });
    await gift({
      id: "anon-two",
      email: "anon.two@test.com",
      status: "intent",
      name: "Anonymous",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Anonymous&donation_id=anon-two"
    );
    expect(data.thanks_repeat).toBe(false);
    expect(data.thanks_name).toBe("Anonymous");
  });

  it("does not count a named return with no donation id as a repeat", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "settled-ada",
      email: "ada@test.com",
      status: "settled",
      name: "Ada",
    });
    const named = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada"
    );
    expect(named.thanks_repeat).toBe(false);
    expect(named.thanks_name).toBe("Ada");
    const blank = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=%20"
    );
    expect(blank.thanks_repeat).toBe(false);
  });

  it("keeps the donor email off the loader payload", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "prior-secret",
      email: "repeat-secret@test.com",
      status: "settled",
      name: "Ada",
    });
    await gift({
      id: "current-secret",
      email: "repeat-secret@test.com",
      status: "intent",
      name: "Ada",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=current-secret"
    );
    expect(data.thanks_repeat).toBe(true);
    expect(email_keys(data)).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("repeat-secret@test.com");
  });

  it("does not count a donor's only gift as a repeat of itself", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "only-ada",
      email: "ada@test.com",
      status: "settled",
      name: "Ada",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=only-ada"
    );
    expect(data.thanks_repeat).toBe(false);
  });

  it("ignores a settled gift on a different campaign", async () => {
    const npo = await org();
    await campaign(npo.id);
    await campaign(npo.id, { id: "camp-other", slug: "spring" });
    await gift({
      id: "elsewhere",
      email: "ada@test.com",
      status: "settled",
      name: "Ada",
      campaign_id: "camp-other",
    });
    await gift({
      id: "here",
      email: "ada@test.com",
      status: "intent",
      name: "Ada",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=here"
    );
    expect(data.thanks_repeat).toBe(false);
  });

  it("does not count an unfinished gift as an earlier donation", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "intent-prior",
      email: "ada@test.com",
      status: "intent",
      name: "Ada",
    });
    await gift({
      id: "intent-current",
      email: "ada@test.com",
      status: "intent",
      name: "Ada",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=intent-current"
    );
    expect(data.thanks_repeat).toBe(false);
  });

  it("does not count a return whose donation has no donor row", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "named-settled",
      email: "ada@test.com",
      status: "settled",
      name: "Ada",
    });
    await gift({
      id: "no-donor",
      email: "ada@test.com",
      status: "intent",
      name: "Ada",
      with_donor: false,
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=no-donor"
    );
    expect(data.thanks_repeat).toBe(false);
  });

  it("does not count a blank email as a repeat of another blank email", async () => {
    const npo = await org();
    await campaign(npo.id);
    await gift({
      id: "blank-prior",
      email: "   ",
      status: "settled",
      name: "Ada",
    });
    await gift({
      id: "blank-current",
      email: "   ",
      status: "intent",
      name: "Ada",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=blank-current"
    );
    expect(data.thanks_repeat).toBe(false);
  });

  it("reports a thanks gift settled when that donation is settled on this campaign", async () => {
    const npo = await org();
    await campaign(npo.id);
    const db = test_db.current!.db;
    await db.insert(donations).values({
      id: "settled-card",
      upusd: 80,
      status: "settled",
      amount_base: 80,
      amount_tip: 15,
      amount_fee_allowance: 5,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe",
      campaign_id: "camp-public",
    });
    await db.insert(donation_donors).values({
      donation_id: "settled-card",
      email: "pat@test.com",
      name: "Pat",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=settled-card"
    );
    expect(data.thanks_name).toBe("Ada");
    expect(data.thanks_usd).toBe(100);
    expect(data.thanks_settled).toBe(true);
  });

  it("leaves a thanks gift unsettled while that donation is still an intent", async () => {
    const npo = await org();
    await campaign(npo.id);
    const db = test_db.current!.db;
    await db.insert(donations).values({
      id: "settled-card",
      upusd: 80,
      status: "intent",
      amount_base: 80,
      amount_tip: 15,
      amount_fee_allowance: 5,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe",
      campaign_id: "camp-public",
    });
    await db.insert(donation_donors).values({
      donation_id: "settled-card",
      email: "pat@test.com",
      name: "Pat",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=settled-card"
    );
    expect(data.thanks_settled).toBe(false);
  });

  it("leaves a thanks gift unsettled when that donation settled on another campaign", async () => {
    const npo = await org();
    await campaign(npo.id);
    await campaign(npo.id, { id: "camp-other", slug: "spring" });
    await test_db.current!.db.insert(donations).values({
      id: "settled-elsewhere",
      upusd: 80,
      status: "settled",
      amount_base: 80,
      amount_tip: 15,
      amount_fee_allowance: 5,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe",
      campaign_id: "camp-other",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=100&donation_currency=USD&donor_name=Ada&donation_id=settled-elsewhere"
    );
    expect(data.thanks_settled).toBe(false);
  });

  it("leaves a thanks gift unsettled when the return has no donation id", async () => {
    const npo = await org();
    await campaign(npo.id);
    await test_db.current!.db.insert(donations).values({
      id: "settled-anon",
      upusd: 25,
      status: "settled",
      amount_base: 25,
      amount_tip: 0,
      amount_fee_allowance: 0,
      currency: "USD",
      frequency: "one-time",
      source: "bg-marketplace",
      via: "stripe",
      campaign_id: "camp-public",
    });
    const data = await load(
      "https://x/org/acme/winter?donation_amount=25&donor_name=%20"
    );
    expect(data.thanks_usd).toBe(25);
    expect(data.thanks_settled).toBe(false);
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
