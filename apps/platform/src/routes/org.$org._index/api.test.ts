import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { user } from "$/pg/schema/auth";
import { campaigns } from "$/pg/schema/campaign";
import { dists } from "$/pg/schema/dist";
import { donation_donors, donations } from "$/pg/schema/donation";
import { donation_messages } from "$/pg/schema/donation-message";
import { npo_media, npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));
const report_error = vi.hoisted(() => vi.fn());

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

vi.mock("#/errors/report", () => ({ report_error }));

const npo_queries = await import("$/pg/queries/npo");
const campaign_queries = await import("$/pg/queries/campaign");
const { NPO_PUBLIC_KEYS } = npo_queries;
const { donation_message_list } = await import("$/pg/queries/donation-message");
const { loader } = await import("./api");
const { create_test_db } = await import("$/pg/test-utils/pglite");

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

const db = () => test_db.current!.db;
let counter = 0;

async function seed_npo(overrides: Partial<typeof npos.$inferInsert> = {}) {
  counter++;
  const [row] = await db()
    .insert(npos)
    .values({
      registration_number: `EIN-LOADER-${counter}`,
      name: `Loader Org ${counter}`,
      slug: `loader-org-${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      ...overrides,
    })
    .returning();
  return row!;
}

/** a settled one-time gift from `email` to the org, worth `upusd` base units a dollar */
async function seed_gift(
  id: string,
  email: string,
  to_id: number,
  campaign_id?: string
) {
  await db().insert(donations).values({
    campaign_id,
    id,
    upusd: 1,
    status: "settled",
    amount_base: 25,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "stripe:card",
  });
  await db().insert(donation_donors).values({ donation_id: id, email });
  await db()
    .insert(dists)
    .values({
      id: `${id}-dist`,
      donation_id: id,
      status: "settled",
      date_created: new Date().toISOString(),
      to_id,
      amount_denom: "USD",
    });
}

async function seed_creator() {
  counter++;
  const [row] = await db()
    .insert(user)
    .values({
      id: `creator-${counter}`,
      name: "Cam Creator",
      email: `creator-${counter}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "Cam",
      last_name: "Creator",
    })
    .returning();
  return row!;
}

/** a live campaign the org runs; `story` is its paragraphs as portable text */
async function seed_campaign(
  owner_npo_id: number,
  id: string,
  story: string[] = [],
  overrides: Partial<typeof campaigns.$inferInsert> = {}
) {
  const creator = await seed_creator();
  await db()
    .insert(campaigns)
    .values({
      id,
      owner_npo_id,
      creator_id: creator.id,
      name: `Campaign ${id}`,
      slug: id,
      status: "live",
      description_pt: JSON.stringify(
        story.map((text, i) => ({
          _type: "block",
          _key: `b${i}`,
          style: "normal",
          markDefs: [],
          children: [{ _type: "span", _key: `s${i}`, text, marks: [] }],
        }))
      ),
      ...overrides,
    });
}

const hours_ago = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();

const load = (param: string, search = "") =>
  loader({
    request: new Request(`https://x/org/${param}${search}`),
    params: { org: param },
  } as any);

/** what the loader throws; a loader that answers instead has its deferred
 * reads settled, so a failure here reports before afterAll closes the db */
const thrown = (p: ReturnType<typeof load>) =>
  p.then(
    async (d: {
      funds: Promise<unknown>;
      media: Promise<unknown>;
      programs: Promise<unknown>;
    }) => {
      await Promise.allSettled([d.funds, d.media, d.programs]);
      return d;
    },
    (e: unknown) => e
  );

describe("public npo profile loader", () => {
  it("sends the npo's profile fields and none of its private columns", async () => {
    const [npo] = await test_db
      .current!.db.insert(npos)
      .values({
        registration_number: "EIN-PROFILE",
        name: "Profile Org",
        slug: "profile-org",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
        street_address: "1 Main St",
        liq: 1234,
        cash: 567,
        lock_units: 89,
        w_form: "w9-eid",
        referral_id: "REF-PROFILE",
        payout_minimum: 50,
      })
      .returning();

    const d = await loader({
      request: new Request("https://x/org/profile-org"),
      params: { org: "profile-org" },
    } as any);
    // settle the deferred reads before afterAll closes the db under them
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.npo).toMatchObject({
      id: npo.id,
      name: "Profile Org",
      street_address: "1 Main St",
    });
    expect(Object.keys(d.npo).sort()).toEqual([...NPO_PUBLIC_KEYS].sort());
    expect(d.url).toBe("https://x/org/profile-org");

    // the id url is an alias of a slugged org's profile
    const thrown = await loader({
      request: new Request(`https://x/org/${npo.id}?referrer=R1`),
      params: { org: String(npo.id) },
    } as any).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(301);
    expect((thrown as Response).headers.get("location")).toBe(
      "/org/profile-org?referrer=R1"
    );
    expect((thrown as Response).headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=86400"
    );
  });

  it("still serves the profile when the donor count fails, without a count", async () => {
    const [npo] = await test_db
      .current!.db.insert(npos)
      .values({
        registration_number: "EIN-NO-COUNT",
        name: "No Count Org",
        slug: "no-count-org",
        endow_designation: "Charity",
        overview_pt: "[]",
        hq_country: "United States",
      })
      .returning();
    vi.spyOn(npo_queries, "npo_donor_count").mockRejectedValueOnce(
      new Error("donor count down")
    );

    const d = await loader({
      request: new Request("https://x/org/no-count-org"),
      params: { org: "no-count-org" },
    } as any);
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.npo).toMatchObject({ id: npo!.id, name: "No Count Org" });
    expect(d.donors).toBeNull();
    expect(report_error).toHaveBeenCalledWith(expect.any(Error), {
      endow_id: npo!.id,
    });
  });

  it("counts the org's distinct settled donors", async () => {
    const npo = await seed_npo();
    await seed_gift("don-count-1", "a@example.com", npo.id);
    await seed_gift("don-count-2", "b@example.com", npo.id);

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.donors).toBe(2);
  });

  it("sends donor messages by name and text only, dropping blank ones", async () => {
    const npo = await seed_npo();
    const org = String(npo.id);
    await seed_gift("don-msg-1", "ana@example.com", npo.id);
    await db()
      .insert(donation_messages)
      .values([
        {
          id: "msg-1",
          donation_id: "don-msg-1",
          npo_id: org,
          donor_name: "Ana",
          donor_message: "Keep going",
          amount: 25,
          date: hours_ago(1),
        },
        {
          id: "msg-blank",
          npo_id: org,
          donor_name: "Ben",
          donor_message: "   ",
          date: hours_ago(2),
        },
        {
          id: "msg-anon",
          npo_id: org,
          donor_name: null,
          donor_message: "Anonymous hello",
          date: hours_ago(3),
        },
        {
          id: "msg-none",
          npo_id: org,
          donor_name: "Cy",
          donor_message: null,
          date: hours_ago(4),
        },
      ]);
    // the feed the loader reads from carries Ana's amount, so a message
    // leaving without one is the loader's doing
    const feed = await donation_message_list(org);
    expect(feed.items.find((m) => m.id === "msg-1")?.amount).toBe(25);

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    // toEqual refuses an extra key, so an amount on either item fails it
    expect(d.messages).toEqual([
      { id: "msg-1", name: "Ana", message: "Keep going" },
      { id: "msg-anon", name: "Donor", message: "Anonymous hello" },
    ]);
  });

  it("shows only the newest featured videos, up to the limit", async () => {
    const npo = await seed_npo();
    const other = await seed_npo();
    const row = (
      id: string,
      hours: number,
      over: Partial<typeof npo_media.$inferInsert> = {}
    ) => ({
      id,
      npo_id: npo.id,
      url: `https://youtu.be/${id}`,
      type: "video" as const,
      featured: true,
      date_created: hours_ago(hours),
      ...over,
    });
    await db()
      .insert(npo_media)
      .values([
        row("unfeatured", 1, { featured: false }),
        row("album", 2, { type: "album" }),
        row("elsewhere", 3, { npo_id: other.id }),
        row("v1", 10),
        row("v2", 11),
        row("v3", 12),
        row("v4", 13),
        row("v5", 14),
      ]);

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.programs]);

    expect((await d.media).map((m) => m.id)).toEqual(["v1", "v2", "v3", "v4"]);
  });

  it("sends each campaign as official, with its mark, donate link and story excerpt", async () => {
    const npo = await seed_npo({ logo: "https://img/org-logo.png" });
    await seed_campaign(
      npo.id,
      "cmp-story",
      ["  Clean  water\tfor", "every village.  "],
      {
        logo: "https://img/cmp-logo.png",
      }
    );

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.campaigns).toEqual([
      expect.objectContaining({
        id: "cmp-story",
        official: true,
        mark: "https://img/cmp-logo.png",
        to: `/org/${npo.slug}/cmp-story`,
        donate_to: `/org/${npo.slug}/cmp-story`,
        excerpt: "Clean water for every village.",
      }),
    ]);
  });

  it("gives a campaign the org's logo as its mark and the org's banner as its image, unless it has its own", async () => {
    const npo = await seed_npo({
      logo: "https://img/org-logo.png",
      image: "https://img/org-banner.png",
    });
    await seed_campaign(npo.id, "cmp-bare", [], { created_at: hours_ago(1) });
    await seed_campaign(npo.id, "cmp-own", [], {
      created_at: hours_ago(2),
      logo: "https://img/cmp-logo.png",
      banner: "https://img/cmp-banner.png",
    });

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.campaigns.map((c) => [c.id, c.mark, c.image])).toEqual([
      ["cmp-bare", "https://img/org-logo.png", "https://img/org-banner.png"],
      ["cmp-own", "https://img/cmp-logo.png", "https://img/cmp-banner.png"],
    ]);
  });

  it("cuts a long story on a word boundary within 160 characters, and sends none as empty", async () => {
    const npo = await seed_npo();
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`);
    await seed_campaign(npo.id, "cmp-long", [words.join(" ")], {
      created_at: hours_ago(1),
    });
    await seed_campaign(npo.id, "cmp-none", [], { created_at: hours_ago(2) });

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    const [long, none] = d.campaigns;
    expect(long!.excerpt.length).toBeLessThanOrEqual(160);
    expect(long!.excerpt).toMatch(/…$/);
    // whole words only: the text before the ellipsis is a prefix of the story
    const kept = long!.excerpt.slice(0, -1).split(" ");
    expect(kept).toEqual(words.slice(0, kept.length));
    expect(kept.length).toBeGreaterThan(20);
    expect(none!.excerpt).toBe("");
  });

  it("counts each campaign's distinct settled donors as its supporters", async () => {
    const npo = await seed_npo();
    await seed_campaign(npo.id, "cmp-backed", [], { created_at: hours_ago(1) });
    await seed_campaign(npo.id, "cmp-quiet", [], { created_at: hours_ago(2) });
    await seed_gift("don-cmp-1", "ana@example.com", npo.id, "cmp-backed");
    await seed_gift("don-cmp-2", "ANA@example.com", npo.id, "cmp-backed");
    await seed_gift("don-cmp-3", "ben@example.com", npo.id, "cmp-backed");
    const counts = vi.spyOn(campaign_queries, "campaign_donor_counts");

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    // email as stored, like the org's donor count: ana and ANA are two
    expect(d.campaigns.map((c) => [c.id, c.supporters])).toEqual([
      ["cmp-backed", 3],
      ["cmp-quiet", 0],
    ]);
    // one grouped read for every card, not one per campaign
    expect(counts).toHaveBeenCalledOnce();
  });

  it("still serves its campaigns when their supporter counts fail, without counts, reporting once", async () => {
    const npo = await seed_npo();
    await seed_campaign(npo.id, "cmp-down-a", [], { created_at: hours_ago(1) });
    await seed_campaign(npo.id, "cmp-down-b", [], { created_at: hours_ago(2) });
    report_error.mockClear();
    const down = new Error("campaign counts down");
    vi.spyOn(campaign_queries, "campaign_donor_counts").mockRejectedValueOnce(
      down
    );

    const d = await load(npo.slug!);
    await Promise.all([d.funds, d.media, d.programs]);

    expect(d.campaigns.map((c) => [c.id, c.supporters])).toEqual([
      ["cmp-down-a", null],
      ["cmp-down-b", null],
    ]);
    expect(report_error).toHaveBeenCalledOnce();
    expect(report_error).toHaveBeenCalledWith(down, { endow_id: npo.id });
  });

  it("answers 404 for an unknown org, by slug or by id", async () => {
    for (const param of ["no-such-org", "999999"]) {
      const res = await thrown(load(param));
      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(404);
    }
  });

  it("answers 404 for an inactive org, by slug or by id, not the id redirect", async () => {
    const npo = await seed_npo({ active: false });

    for (const param of [npo.slug!, String(npo.id)]) {
      const res = await thrown(load(param));
      expect(res).toBeInstanceOf(Response);
      expect((res as Response).status).toBe(404);
    }
  });
});
