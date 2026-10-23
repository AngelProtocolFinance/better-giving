import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { seed_fund } from "#/__tests__/fixtures/funds";
import { user } from "$/pg/schema/auth";
import { campaigns } from "$/pg/schema/campaign";
import { npo_media, npos } from "$/pg/schema/npo";
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

// .env.test carries a gateway key, so an unmocked pick would call the real gateway
const jev_choice = vi.hoisted(() =>
  vi.fn(async (_state: Record<string, unknown>) => null as string | null)
);
vi.mock("$/jev", () => ({ jev_choice }));

const { parse_cli, review_rows, to_csv } = await import("./layout-review");
const { create_test_db } = await import("$/pg/test-utils/pglite");

const ORIGIN = "https://staging.example";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

// each test reads every published org, so each starts from none
beforeEach(async () => {
  await test_db.current!.client.exec("truncate npos cascade");
  jev_choice.mockReset().mockResolvedValue(null);
});

const db = () => test_db.current!.db;
let counter = 0;

async function seed_npo(overrides: Partial<typeof npos.$inferInsert> = {}) {
  counter++;
  const [row] = await db()
    .insert(npos)
    .values({
      registration_number: `EIN-REVIEW-${counter}`,
      name: `Review Org ${counter}`,
      slug: `review-org-${counter}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      ...overrides,
    })
    .returning();
  return row!;
}

async function seed_creator() {
  counter++;
  const [row] = await db()
    .insert(user)
    .values({
      id: `review-creator-${counter}`,
      name: "Cam Creator",
      email: `review-creator-${counter}@example.com`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      first_name: "Cam",
      last_name: "Creator",
    })
    .returning();
  return row!;
}

/** portable text with one block per paragraph */
const pt = (...paras: string[]) =>
  JSON.stringify(
    paras.map((text, i) => ({
      _type: "block",
      _key: `b${i}`,
      style: "normal",
      markDefs: [],
      children: [{ _type: "span", _key: `s${i}`, text, marks: [] }],
    }))
  );

async function seed_campaign(owner_npo_id: number, id: string) {
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
      description_pt: "[]",
    });
}

describe("layout review rows", () => {
  it("measures each published, active org as its page does, with no Jev column when Jev gives no answer", async () => {
    const npo = await seed_npo({
      name: " Shape Org ",
      tagline: "  Water first ",
      // "We dig wells.\n\nAnd schools." as plain text, once trimmed
      overview_pt: pt("  We dig wells.", "And schools.  "),
      image: "https://img/banner.png",
      logo: null,
    });
    await seed_npo({ name: "Hidden Org", published: false });
    await seed_npo({ name: "Closed Org", active: false });
    await seed_campaign(npo.id, "review-cmp-1");
    await seed_campaign(npo.id, "review-cmp-2");
    const creator = await seed_creator();
    const fund = { npo_owner: npo.id, creator_id: creator.id, published: true };
    await seed_fund(db(), { ...fund, id: "review-fund-open" });
    await seed_fund(db(), { ...fund, id: "review-fund-off", active: false });
    await seed_fund(db(), {
      ...fund,
      id: "review-fund-ended",
      expiration: "2020-01-01T00:00:00.000Z",
    });
    await db().insert(programs).values({
      id: "review-prog",
      npo_id: npo.id,
      title: "Wells",
      description_pt: "[]",
    });
    await db()
      .insert(npo_media)
      .values(
        ["review-v1", "review-v2", "review-v3"].map((id, i) => ({
          id,
          npo_id: npo.id,
          url: `https://youtu.be/${id}`,
          type: "video" as const,
          // the page lists featured videos only
          featured: i < 2,
        }))
      );

    const rows = await review_rows({ origin: ORIGIN });

    expect(rows).toEqual([
      {
        id: npo.id,
        name: " Shape Org ",
        link: `${ORIGIN}/org/${npo.slug}`,
        story_chars: 27,
        tagline_chars: 11,
        name_chars: 9,
        has_banner: true,
        has_logo: false,
        campaigns: 2,
        fundraisers: 1,
        programs: 1,
        videos: 2,
        items_total: 6,
        threshold: "hub",
        jev: null,
      },
    ]);
  });

  it("puts the orgs where Jev and the thresholds disagree first, then the rest by name", async () => {
    // no story and no items: the thresholds say poster for all three
    await seed_npo({ name: "Bravo Org" });
    await seed_npo({ name: "Charlie Group" });
    await seed_npo({ name: "Alpha" });
    // Jev sees measures only, so the name's length tells the orgs apart
    const by_name_chars: Record<number, string | null> = {
      5: null,
      9: "poster",
      13: "letter",
    };
    jev_choice.mockImplementation(
      async (state) => by_name_chars[state.name_chars as number]!
    );

    const rows = await review_rows({ origin: ORIGIN });

    expect(rows.map((r) => [r.name, r.threshold, r.jev])).toEqual([
      ["Charlie Group", "poster", "letter"],
      ["Alpha", "poster", null],
      ["Bravo Org", "poster", "poster"],
    ]);
  });

  it("asks Jev about at most four orgs at once", async () => {
    for (let i = 0; i < 7; i++) await seed_npo();
    let in_flight = 0;
    let peak = 0;
    jev_choice.mockImplementation(async () => {
      peak = Math.max(peak, ++in_flight);
      await new Promise((r) => setTimeout(r, 20));
      in_flight--;
      return "poster";
    });

    const rows = await review_rows({ origin: ORIGIN });

    expect(rows).toHaveLength(7);
    expect(peak).toBe(4);
  });

  it("reads only the first orgs by name with a limit", async () => {
    await seed_npo({ name: "Bravo Org" });
    await seed_npo({ name: "Alpha" });
    await seed_npo({ name: "Charlie Group" });

    const rows = await review_rows({ origin: ORIGIN, limit: 2 });

    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Bravo Org"]);
  });
});

describe("layout review csv", () => {
  const row = {
    id: 7,
    name: 'Wells, "Water" & Co',
    link: `${ORIGIN}/org/wells`,
    story_chars: 400,
    tagline_chars: 0,
    name_chars: 19,
    has_banner: false,
    has_logo: true,
    campaigns: 1,
    fundraisers: 0,
    programs: 2,
    videos: 0,
    items_total: 3,
    threshold: "letter",
    jev: "poster",
  } as const;

  it("writes one header line and one quoted line per org, agree left blank without a Jev answer", () => {
    const csv = to_csv([
      row,
      { ...row, id: 8, name: "=HYPERLINK(1)", jev: null },
      { ...row, id: 9, name: "Same", jev: "letter" },
    ]);

    expect(csv).toBe(
      [
        "id,name,link,story_chars,tagline_chars,name_chars,has_banner,has_logo,campaigns,fundraisers,programs,videos,items_total,threshold,jev,agree",
        `7,"Wells, ""Water"" & Co",${ORIGIN}/org/wells,400,0,19,false,true,1,0,2,0,3,letter,poster,false`,
        // a spreadsheet would run a name that opens like a formula
        `8,'=HYPERLINK(1),${ORIGIN}/org/wells,400,0,19,false,true,1,0,2,0,3,letter,,`,
        `9,Same,${ORIGIN}/org/wells,400,0,19,false,true,1,0,2,0,3,letter,letter,true`,
        "",
      ].join("\n")
    );
  });
});

describe("layout review arguments", () => {
  const DEFAULT = "https://env.example";

  it("links to the loaded env's origin unless --origin names another, reduced to its origin", () => {
    expect(parse_cli([], DEFAULT)).toEqual({ origin: DEFAULT });
    expect(
      parse_cli(["--origin=https://staging.example/x/", "--limit=25"], DEFAULT)
    ).toEqual({ origin: "https://staging.example", limit: 25 });
  });

  it.each([
    [["--limit=0"], "--limit must be a whole number above 0"],
    [["--limit=ten"], "--limit must be a whole number above 0"],
    [["--origin=staging.example"], "--origin must be an http(s) url"],
    [["--bogus"], "Unknown option '--bogus'"],
    [["extra"], "Unexpected argument 'extra'"],
  ])("refuses %j as a usage error", (argv, message) => {
    expect(() => parse_cli(argv, DEFAULT)).toThrow(
      expect.objectContaining({
        name: "UsageError",
        message: expect.stringContaining(message),
      })
    );
  });

  it("asks for help", () => {
    expect(parse_cli(["--help"], DEFAULT)).toEqual({ help: true });
  });
});
