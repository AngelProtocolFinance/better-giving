import { createRoutesStub, useFetcher } from "react-router";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { admin_ctx } from "$/auth/test-utils";
import { npo_get } from "$/pg/queries/npo";
import { npos } from "$/pg/schema/npo";
import { create_test_db, type TestDb } from "$/pg/test-utils/pglite";

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
  (await import("$/auth/test-utils")).make_auth_mock()
);

vi.mock("#/.server/toast", () => ({
  dataWithSuccess: vi.fn((d: unknown) => d),
  dataWithError: vi.fn((d: unknown) => d),
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

import { action, loader } from "../api";
import OrganizationPage from "../route";

const NPO_SEED: Omit<typeof npos.$inferInsert, "id"> = {
  registration_number: "EIN123456",
  name: "Test Charity",
  endow_designation: "Charity",
  hq_country: "United States",
  tagline: "Helping the world",
  image: "https://example.com/banner.jpg",
  logo: "https://example.com/logo.jpg",
  card_img: "https://example.com/card.jpg",
  overview_pt: "Test charity overview text.",
  overview_v2: "Test charity overview text.",
  active_in_countries: [],
  published: false,
  active: true,
  street_address: "123 Main St",
  url: "https://example.org",
};

const note =
  "Changing your org slug would make any links that depend on it stale";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(npos);
  vi.restoreAllMocks();
});

async function seed_npo(
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({ ...NPO_SEED, ...overrides })
    .returning();
  return row!;
}

function stub(npo_id: number, route_action: unknown = action) {
  return createRoutesStub([
    {
      path: "/admin/:id/organization",
      Component: OrganizationPage,
      HydrateFallback: () => null,
      loader: loader as any,
      action: route_action as any,
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
    },
  ]);
}

async function render_org(npo_id: number) {
  const Stub = stub(npo_id);
  return render(
    <Stub
      initialEntries={[`/admin/${npo_id}/organization`]}
      future={{ v8_middleware: true }}
    />
  );
}

function free_slug() {
  const og = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("/api/npos/")) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    return og(input, init as RequestInit);
  });
}

async function post(npo_id: number, body: { slug: string; tagline?: string }) {
  await cleanup();
  const Stub = createRoutesStub([
    {
      path: "/admin/:id/organization",
      Component: function Poster() {
        const f = useFetcher<{ ok: boolean; error?: string }>();
        return (
          <>
            <button
              type="button"
              onClick={() =>
                f.submit(body, { method: "post", encType: "application/json" })
              }
            >
              save
            </button>
            <p>{f.data?.error}</p>
          </>
        );
      },
      action: action as any,
      middleware: [
        async ({ context }, next) => {
          context.set(admin_ctx, npo_id);
          return next();
        },
      ],
    },
  ]);
  const screen = await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/organization`]}
      future={{ v8_middleware: true }}
    />
  );
  await screen.getByRole("button", { name: "save" }).click();
  return screen;
}

describe("organization — slug unset", () => {
  it("can be set, then shows locked", async () => {
    free_slug();
    const npo = await seed_npo();
    const screen = await render_org(npo.id);
    const slug = screen.getByLabelText("Org slug");
    await expect.element(slug).toBeEnabled();
    await expect.element(slug).toHaveAttribute("placeholder", "TestCharity");

    await slug.fill("acme-org");
    expect(
      screen
        .getByText("Logo of your organization")
        .element()
        .getAttribute("data-required")
    ).toBe("true");
    await screen.getByRole("button", { name: "Save organization" }).click();
    const cancel = screen.getByRole("button", { name: "Cancel", exact: true });
    await expect
      .element(screen.getByRole("heading", { name: "Lock this address?" }))
      .toBeVisible();
    await expect
      .element(screen.getByText("This address can't be changed later."))
      .toBeVisible();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(cancel.element());
    });
    (
      screen
        .getByRole("button", { name: "Save", exact: true })
        .element() as HTMLElement
    ).click();

    await vi.waitFor(async () =>
      expect((await npo_get(npo.id))?.slug).toBe("acme-org")
    );
    await expect.element(screen.getByLabelText("Org slug")).toBeDisabled();
    await expect.element(screen.getByText(note)).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /\/marketplace\/acme-org$/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /\/donate\/acme-org$/ }))
      .toBeVisible();
  });

  it("focuses the logo before a later invalid field", async () => {
    const npo = await seed_npo({ logo: "" });
    const screen = await render_org(npo.id);
    const reg = screen.getByLabelText(/ein.*registration/i);
    await expect.element(reg).toBeVisible();
    await reg.fill("NEW999");
    await screen.getByRole("button", { name: "Save organization" }).click();
    await vi.waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByLabelText("Logo of your organization").element()
      );
    });
    expect((await npo_get(npo.id))?.registration_number).toBe("EIN123456");
  });

  it("asks before the first slug and cancel leaves it unset", async () => {
    free_slug();
    const npo = await seed_npo();
    const screen = await render_org(npo.id);
    await screen.getByLabelText("Org slug").fill("acme-org");
    await screen.getByRole("button", { name: "Save organization" }).click();
    const cancel = screen.getByRole("button", { name: "Cancel", exact: true });
    await expect.element(cancel).toBeVisible();
    (cancel.element() as HTMLElement).click();
    await expect
      .element(screen.getByRole("heading", { name: "Lock this address?" }))
      .not.toBeInTheDocument();
    expect((await npo_get(npo.id))?.slug).toBeFalsy();
    await expect.element(screen.getByLabelText("Org slug")).toBeEnabled();
  });
});

describe("organization — slug set", () => {
  it("is read-only and lists the marketplace and donate urls", async () => {
    const npo = await seed_npo({ slug: "already-set" });
    const screen = await render_org(npo.id);
    const slug = screen.getByLabelText("Org slug");
    await expect.element(slug).toBeVisible();
    await expect.element(slug).toBeDisabled();
    await expect.element(slug).toHaveDisplayValue("already-set");
    await expect.element(screen.getByText(note)).toBeVisible();
    await expect
      .element(
        screen.getByRole("link", { name: /\/marketplace\/already-set$/ })
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: /\/donate\/already-set$/ }))
      .toBeVisible();

    await screen.getByLabelText(/ein.*registration/i).fill("NEW999");
    await screen.getByRole("button", { name: "Save organization" }).click();
    await vi.waitFor(async () =>
      expect((await npo_get(npo.id))?.registration_number).toBe("NEW999")
    );
    expect((await npo_get(npo.id))?.slug).toBe("already-set");
  });
});

describe("organization — stored route slug", () => {
  it("saves other fields and leaves the slug", async () => {
    const npo = await seed_npo({ slug: "donate" });
    const screen = await render_org(npo.id);
    await expect.element(screen.getByLabelText("Org slug")).toBeDisabled();
    await expect
      .element(screen.getByLabelText("Org slug"))
      .toHaveDisplayValue("donate");

    await screen.getByLabelText(/ein.*registration/i).fill("NEW999");
    await screen.getByRole("button", { name: "Save organization" }).click();
    await vi.waitFor(async () =>
      expect((await npo_get(npo.id))?.registration_number).toBe("NEW999")
    );
    expect((await npo_get(npo.id))?.slug).toBe("donate");
  });

  it("accepts a direct post that repeats the stored slug", async () => {
    const npo = await seed_npo({ slug: "donate" });
    await post(npo.id, { slug: "donate", tagline: "after" });
    await vi.waitFor(async () =>
      expect((await npo_get(npo.id))?.tagline).toBe("after")
    );
    expect((await npo_get(npo.id))?.slug).toBe("donate");
  });
});

describe("organization — server refusal", () => {
  it("refuses a direct post that changes a set slug", async () => {
    const npo = await seed_npo({ slug: "already-set" });
    const screen = await post(npo.id, { slug: "changed", tagline: "nope" });
    await expect
      .element(
        screen.getByText("The org slug is already set and cannot be changed")
      )
      .toBeVisible();
    const saved = await npo_get(npo.id);
    expect(saved?.slug).toBe("already-set");
    expect(saved?.tagline).toBe("Helping the world");
  });

  it("accepts a direct post that sets a slug for the first time", async () => {
    const npo = await seed_npo();
    await post(npo.id, { slug: "from-post" });
    await vi.waitFor(async () =>
      expect((await npo_get(npo.id))?.slug).toBe("from-post")
    );
  });

  it("refuses a reserved slug", async () => {
    const npo = await seed_npo();
    const screen = await render_org(npo.id);
    await screen.getByLabelText("Org slug").fill("donate");
    await screen.getByRole("button", { name: "Save organization" }).click();
    (
      screen
        .getByRole("button", { name: "Save", exact: true })
        .element() as HTMLElement
    ).click();
    await expect
      .element(screen.getByText("donate matches a top-level route"))
      .toBeVisible();
    expect((await npo_get(npo.id))?.slug).toBeFalsy();

    await cleanup();
    const posted = await post(npo.id, { slug: "org" });
    await expect.element(posted.getByText("org is reserved")).toBeVisible();
    expect((await npo_get(npo.id))?.slug).toBeFalsy();
  });

  it("refuses a slug another nonprofit already has", async () => {
    const npo = await seed_npo();
    const other = await seed_npo({
      registration_number: "OTHER789",
      slug: "taken-slug",
    });
    const og = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/npos/")) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: other.id }), { status: 200 })
        );
      }
      return og(input, init as RequestInit);
    });

    const screen = await render_org(npo.id);
    await screen.getByLabelText("Org slug").fill("taken-slug");
    await screen.getByRole("button", { name: "Save organization" }).click();
    (
      screen
        .getByRole("button", { name: "Save", exact: true })
        .element() as HTMLElement
    ).click();
    await expect
      .element(screen.getByText(/taken-slug.*already taken/i))
      .toBeVisible();
    expect((await npo_get(npo.id))?.slug).toBeFalsy();

    vi.restoreAllMocks();
    await cleanup();
    const posted = await post(npo.id, { slug: "taken-slug" });
    await expect
      .element(posted.getByText("Slug taken-slug is already taken"))
      .toBeVisible();
    expect((await npo_get(npo.id))?.slug).toBeFalsy();
  });
});

describe("organization — headquarters", () => {
  it("clear blocks submit; refill persists", async () => {
    const npo = await seed_npo();
    const screen = await render_org(npo.id);
    const country_input = screen.getByPlaceholder("Select a country");
    await expect.element(country_input).toHaveDisplayValue("United States");

    const combo_row = (country_input.element() as HTMLInputElement)
      .parentElement!;
    const buttons = page.elementLocator(combo_row).getByRole("button");
    await buttons.nth(1).click();

    (
      screen
        .getByRole("button", { name: "Save organization" })
        .element() as HTMLElement
    ).click();
    await expect.element(screen.getByText(/required/i).first()).toBeVisible();
    expect((await npo_get(npo.id))?.hq_country).toBe("United States");

    await country_input.fill("Fran");
    await expect
      .element(screen.getByRole("option", { name: /France/i }))
      .toBeVisible();
    await screen.getByRole("option", { name: /France/i }).click();
    await screen.getByRole("button", { name: "Save organization" }).click();
    await vi.waitFor(async () =>
      expect((await npo_get(npo.id))?.hq_country).toBe("France")
    );
  });

  it("clear button refocuses the input and reopens the dropdown", async () => {
    const npo = await seed_npo();
    const screen = await render_org(npo.id);
    const country_input = screen.getByPlaceholder("Select a country");
    await expect.element(country_input).toHaveDisplayValue("United States");
    expect(screen.getByRole("option").query()).toBeNull();

    const combo_row = (country_input.element() as HTMLInputElement)
      .parentElement!;
    await page.elementLocator(combo_row).getByRole("button").nth(1).click();

    await expect.element(country_input).toHaveDisplayValue("");
    expect(document.activeElement).toBe(country_input.element());
    await expect
      .element(screen.getByRole("option", { name: /Afghanistan/i }))
      .toBeVisible();
  });
});
