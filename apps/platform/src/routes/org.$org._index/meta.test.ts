import type { MetaDescriptor } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { base_url } from "#/constants/env";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite";

const test_db = vi.hoisted(() => ({ current: null as TestDb | null }));

// the layout pick asks Jev; stubbed so a run is deterministic (an unset key is what keeps the suite off the gateway)
vi.mock("$/jev", () => ({ jev_choice: async () => null }));

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
vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: unknown) => Component,
  createClientLoaderCache: () => undefined,
}));

const { loader, meta } = await import("./route");
const { create_test_db } = await import("$/pg/test-utils/pglite");

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

type Descriptor = MetaDescriptor & Record<string, unknown>;

/** the meta a crawler reads for `/org/<param>`, from the real loader */
async function meta_of(param: string) {
  const { data: d } = await loader({
    request: new Request(`${base_url}/org/${param}`),
    params: { org: param },
  } as never);
  await Promise.all([d.funds, d.media, d.programs]);
  return (meta as any)({ loaderData: d }) as Descriptor[];
}

async function seed(label: string, slug?: string) {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({
      registration_number: `EIN-META-${label}`,
      name: `Meta ${label}`,
      tagline: `Tagline ${label}`,
      endow_designation: "Charity",
      overview_pt: "[]",
      hq_country: "United States",
      published: true,
      ...(slug ? { slug } : {}),
    })
    .returning();
  return row!;
}

const urls_of = (ds: Descriptor[]) => ({
  canonical: ds.find((d) => d.rel === "canonical")?.href,
  og: ds.find((d) => d.property === "og:url")?.content,
  twitter: ds.find((d) => d.property === "twitter:url")?.content,
});

interface ITrail {
  itemListElement: { position: number; name: string; item: string }[];
}

const trail_of = (ds: Descriptor[]) => {
  const ld = ds.find((d) => "script:ld+json" in d);
  if (!ld) throw new Error("no json-ld descriptor");
  return (ld["script:ld+json"] as ITrail).itemListElement;
};

describe("org profile meta", () => {
  it("names /org/<slug> as canonical, og url and last breadcrumb for an org with a slug", async () => {
    await seed("slugged", "meta-slugged");
    const ds = await meta_of("meta-slugged");
    const url = `${base_url}/org/meta-slugged`;

    expect(urls_of(ds)).toEqual({ canonical: url, og: url, twitter: url });
    expect(ds[0]).toEqual({ title: "Meta slugged - Better Giving" });
    expect(trail_of(ds)).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: base_url },
      {
        "@type": "ListItem",
        position: 2,
        name: "Marketplace",
        item: `${base_url}/marketplace`,
      },
      { "@type": "ListItem", position: 3, name: "Meta slugged", item: url },
    ]);
  });

  it("names /org/<id> while the org has no slug", async () => {
    const npo = await seed("bare");
    const ds = await meta_of(String(npo.id));
    const url = `${base_url}/org/${npo.id}`;

    expect(urls_of(ds)).toEqual({ canonical: url, og: url, twitter: url });
    expect(trail_of(ds).at(-1)).toMatchObject({ name: "Meta bare", item: url });
  });
});
