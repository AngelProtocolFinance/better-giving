import { HttpResponse, http } from "msw";
import { createRoutesStub, useOutletContext } from "react-router";
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
import { render } from "vitest-browser-react";
import { mswWorker } from "#/setup-tests-browser";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks (hoisted) ---

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
  dataWithSuccess: vi.fn((_d: unknown, msg: string) => ({ toast: msg })),
  dataWithError: vi.fn((_d: unknown, msg: string) => ({ error: msg })),
}));

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

vi.mock("#/.server/funds", () => ({
  get_funds_npo_memberof: vi.fn(async () => []),
}));

// --- imports (after mocks hoisted) ---

import { Target, to_target } from "#/components/target";
import MarketplacePage, {
  loader as marketplace_loader,
} from "#/routes/_app.marketplace/route";
import ProfilePage from "#/routes/_app.marketplace_.$id/route";
import { DetailsColumn } from "#/routes/_app.marketplace_.$id._index/details-column";
import { admin_ctx } from "$/auth/test-utils";
import { npo_get } from "$/pg/queries/npo";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import { action, loader } from "../api";
import EditProfilePage from "../route";

// --- setup ---

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
  claimed: true,
  street_address: "123 Main St",
  url: "https://example.org",
};

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(async () => {
  await test_db.current!.db.delete(npos);
  // msw handlers for profile page SWR calls
  mswWorker.use(
    http.get("/api/me", () => HttpResponse.json(null, { status: 401 })),
    http.get("/api/npo/:id/donors", () =>
      HttpResponse.json({ items: [], next: null })
    )
  );
});

// --- helpers ---

async function seed_npo(
  overrides: Partial<Omit<typeof npos.$inferInsert, "id">> = {}
) {
  const [row] = await test_db
    .current!.db.insert(npos)
    .values({ ...NPO_SEED, ...overrides })
    .returning();
  return row;
}

async function render_edit(npo_id: number) {
  const Stub = createRoutesStub(
    [
      {
        path: "/admin/:id/edit-profile",
        Component: EditProfilePage,
        HydrateFallback: () => null,
        loader: loader as any,
        action: action as any,
        middleware: [
          async ({ context }, next) => {
            context.set(admin_ctx, npo_id);
            return next();
          },
        ],
      },
    ]
    // second arg unused — context is auto-created when v8_middleware is set
  );

  return await render(
    <Stub
      initialEntries={[`/admin/${npo_id}/edit-profile`]}
      future={{ v8_middleware: true }}
    />
  );
}

async function render_profile(npo_id: number) {
  const Stub = createRoutesStub([
    {
      path: "/profile/:id",
      Component: ProfilePage,
      HydrateFallback: () => null,
      loader: async ({ params }) => {
        const npo = await npo_get(Number(params!.id));
        if (!npo) throw new Response(null, { status: 404 });
        return {
          npo,
          programs: Promise.resolve([]),
          media: Promise.resolve([]),
          funds: Promise.resolve([]),
        };
      },
      children: [
        {
          index: true,
          Component: function ProfileDetails() {
            const { npo } = useOutletContext<{ npo: any }>();
            return (
              <DetailsColumn
                npo={npo}
                target={
                  npo.target && (
                    <Target
                      text={<Target.Text classes="mb-2" />}
                      progress={npo.contributions_total ?? 0}
                      target={to_target(npo.target)}
                    />
                  )
                }
              />
            );
          },
        },
      ],
    },
  ]);

  return await render(<Stub initialEntries={[`/profile/${npo_id}`]} />);
}

async function render_marketplace() {
  const Stub = createRoutesStub([
    {
      path: "/marketplace",
      Component: MarketplacePage,
      HydrateFallback: () => null,
      loader: marketplace_loader,
    },
  ]);

  return await render(<Stub initialEntries={["/marketplace"]} />);
}

// --- tests ---

describe("edit profile — renders pre-filled", () => {
  it("shows seeded NPO data in form fields", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    // wait for form to render
    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();
    await expect
      .element(screen.getByLabelText(/tagline/i))
      .toHaveDisplayValue("Helping the world");

    await expect
      .element(screen.getByLabelText(/ein.*registration/i))
      .toHaveDisplayValue("EIN123456");
    await expect
      .element(screen.getByLabelText(/address/i))
      .toHaveDisplayValue("123 Main St");
    // url: sans_https strips prefix
    await expect
      .element(screen.getByLabelText(/website/i))
      .toHaveDisplayValue("example.org");

    // submit disabled when not dirty
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();
  });
});

describe("edit profile — text fields", () => {
  it("edits tagline, registration, address → DB + profile", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    // edit fields
    const tagline = screen.getByLabelText(/tagline/i);
    await tagline.clear();
    await tagline.fill("New tagline");

    const regnum = screen.getByLabelText(/ein.*registration/i);
    await regnum.clear();
    await regnum.fill("NEW999");

    const address = screen.getByLabelText(/address/i);
    await address.clear();
    await address.fill("456 New Ave");

    // submit
    await screen.getByRole("button", { name: /submit changes/i }).click();

    // revalidation completes → form resets dirty
    await expect
      .element(screen.getByLabelText(/tagline/i))
      .toHaveDisplayValue("New tagline");
    // isDirty resets async — one render after values sync
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();

    // verify on profile page
    await screen.unmount();
    const profile = await render_profile(npo.id);

    await expect.element(profile.getByText("New tagline")).toBeInTheDocument();
    await expect.element(profile.getByText("NEW999")).toBeInTheDocument();
    await expect.element(profile.getByText("456 New Ave")).toBeInTheDocument();
  });
});

describe("edit profile — organization fields", () => {
  it("changes designation + hq_country → DB + profile", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    // change designation: click select trigger, pick new
    await screen
      .getByRole("combobox", { name: /organization designation/i })
      .click();
    await expect
      .element(screen.getByRole("option", { name: "University" }))
      .toBeVisible();
    await screen.getByRole("option", { name: "University" }).click();

    // change hq_country
    const country_input = screen.getByPlaceholder("Select a country");
    await country_input.clear();
    await country_input.fill("Canada");
    await expect
      .element(screen.getByRole("option", { name: /Canada/i }))
      .toBeVisible();
    await screen.getByRole("option", { name: /Canada/i }).click();

    // submit
    await screen.getByRole("button", { name: /submit changes/i }).click();

    // revalidation completes → form resets dirty
    // combo display value + isDirty reset async after revalidation
    await expect
      .element(screen.getByPlaceholder("Select a country"))
      .toHaveDisplayValue("Canada");
    // isDirty resets async after values sync
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();

    // verify on profile page
    await screen.unmount();
    const profile = await render_profile(npo.id);

    await expect
      .element(profile.getByText("Test Charity").first())
      .toBeVisible();
    await expect.element(profile.getByText(/canada/i).first()).toBeVisible();
  });

  it("hq_country combo: clear → required error blocks submit; refill → submit succeeds", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    // tagline edit makes the form dirty so submit is enabled
    await screen.getByLabelText(/tagline/i).fill("New tagline");

    const country_input = screen.getByPlaceholder("Select a country");
    await expect.element(country_input).toHaveDisplayValue("United States");

    // click the X clear button — combo row has 2 buttons: trigger (flag) then X
    const combo_row = (country_input.element() as HTMLInputElement)
      .parentElement!;
    const buttons = page.elementLocator(combo_row).getByRole("button");
    await buttons.nth(1).click();

    // submit empty → required error renders, form does not persist
    await screen.getByRole("button", { name: /submit changes/i }).click();
    await expect.element(screen.getByText(/required/i).first()).toBeVisible();

    const reloaded = await npo_get(npo.id);
    expect(reloaded?.hq_country).toBe("United States"); // unchanged
    expect(reloaded?.tagline).toBe("Helping the world"); // unchanged

    // refill via filter + select → submit succeeds
    await country_input.fill("Fran");
    await expect
      .element(screen.getByRole("option", { name: /France/i }))
      .toBeVisible();
    await screen.getByRole("option", { name: /France/i }).click();

    await screen.getByRole("button", { name: /submit changes/i }).click();

    await expect
      .element(screen.getByPlaceholder("Select a country"))
      .toHaveDisplayValue("France");
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();

    const persisted = await npo_get(npo.id);
    expect(persisted?.hq_country).toBe("France");
    expect(persisted?.tagline).toBe("New tagline");
  });

  it("hq_country combo: clear button refocuses input and reopens dropdown", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    const country_input = screen.getByPlaceholder("Select a country");
    await expect.element(country_input).toHaveDisplayValue("United States");

    // before clear: dropdown closed (no options rendered)
    expect(screen.getByRole("option").query()).toBeNull();

    // click the X clear button — combo row has 2 buttons: trigger (flag) then X
    const combo_row = (country_input.element() as HTMLInputElement)
      .parentElement!;
    const buttons = page.elementLocator(combo_row).getByRole("button");
    await buttons.nth(1).click();

    // input cleared + focused + dropdown re-opens with options
    await expect.element(country_input).toHaveDisplayValue("");
    expect(document.activeElement).toBe(country_input.element());
    await expect
      .element(screen.getByRole("option", { name: /Afghanistan/i }))
      .toBeVisible();
  });
});

describe("edit profile — active countries (multi-combo)", () => {
  it("filter → select multiple, deselect all, refill → DB persists array", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    // anchor on the "Active countries" Label and scope into its sibling section
    const label_el = screen
      .getByText("Active countries", { exact: true })
      .element() as HTMLElement;
    const multi_section = label_el.nextElementSibling as HTMLElement;
    const scoped = page.elementLocator(multi_section);
    const multi_input = scoped.getByRole("combobox");

    // open + filter via typing
    await multi_input.click();
    await multi_input.fill("Cana");
    await expect
      .element(screen.getByRole("option", { name: /^Canada$/i }))
      .toBeVisible();
    // filter narrows — Brazil is filtered out
    expect(
      screen.getByRole("option", { name: /^Brazil$/i }).query()
    ).toBeNull();
    await screen.getByRole("option", { name: /^Canada$/i }).click();

    // chip rendered in the multi-combo section (scoped — popup options share the text)
    await expect
      .element(scoped.getByText("Canada", { exact: true }))
      .toBeVisible();

    // filter + select second value
    await multi_input.fill("Fran");
    await screen.getByRole("option", { name: /^France$/i }).click();
    await expect
      .element(scoped.getByText("France", { exact: true }))
      .toBeVisible();

    // Reset clears all chips. Portaled popup may render offscreen — native click bypasses viewport check
    await multi_input.click();
    await multi_input.fill("");
    (
      screen.getByRole("button", { name: /^reset$/i }).element() as HTMLElement
    ).click();
    // chips live in multi_section; options are portaled out — scope assertions to the section
    await expect
      .element(scoped.getByText("Canada", { exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(scoped.getByText("France", { exact: true }))
      .not.toBeInTheDocument();

    // refill single + submit → DB persists array
    await multi_input.fill("Cana");
    await screen.getByRole("option", { name: /^Canada$/i }).click();
    // popup stays open after multi-select; dismiss before clicking submit
    (multi_input.element() as HTMLInputElement).focus();
    (multi_input.element() as HTMLInputElement).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await screen.getByRole("button", { name: /submit changes/i }).click();

    await vi.waitFor(async () => {
      const reloaded = await npo_get(npo.id);
      expect(reloaded?.active_in_countries).toEqual(["Canada"]);
    });
  });
});

describe("edit profile — social media", () => {
  it("adds social URLs → DB + profile", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/facebook/i)).toBeVisible();

    await screen.getByLabelText(/facebook/i).fill("facebook.com/testorg");
    await screen.getByLabelText(/linkedin/i).fill("linkedin.com/in/testorg");

    // submit
    await screen.getByRole("button", { name: /submit changes/i }).click();

    // revalidation completes → form resets dirty
    await expect
      .element(screen.getByLabelText(/facebook/i))
      .toHaveDisplayValue("facebook.com/testorg");
    // isDirty resets async — one render after values sync
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();

    // verify on profile page — socials renders ExtLinks
    await screen.unmount();
    const profile = await render_profile(npo.id);

    await expect
      .element(profile.getByText("Test Charity").first())
      .toBeVisible();
    // social icons render as links
    const links = profile.getByRole("link");
    // use vi.waitFor for non-element assertion on locator results
    await vi.waitFor(async () => {
      const els = links.elements();
      const hrefs = els.map((l) => l.getAttribute("href"));
      expect(hrefs).toContain("https://facebook.com/testorg");
      expect(hrefs).toContain("https://linkedin.com/in/testorg");
    });
  });
});

describe("edit profile — published toggle", () => {
  it("toggles published status", async () => {
    const npo = await seed_npo({ published: false });
    const screen = await render_edit(npo.id);

    // initially unpublished
    await expect
      .element(screen.getByText(/not visible in the marketplace/i))
      .toBeVisible();

    // click toggle — dispatch via JS (element below fold, not visible to Playwright)
    (screen.getByRole("switch").element() as HTMLElement).click();

    // ui updates
    await expect
      .element(screen.getByText(/visible in the marketplace/i))
      .toBeInTheDocument();

    // submit
    await screen.getByRole("button", { name: /submit changes/i }).click();

    // isDirty resets async — one render after values sync
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();
    await expect
      .element(screen.getByText(/your profile is visible in the marketplace/i))
      .toBeInTheDocument();

    // verify NPO appears on marketplace (filters by published + claimed)
    await screen.unmount();
    const marketplace = await render_marketplace();

    await expect
      .element(marketplace.getByText("Test Charity"))
      .toBeInTheDocument();
  });
});

describe("edit profile — slug taken", () => {
  it("shows error prompt when slug is already taken", async () => {
    // seed two NPOs — one owns the slug
    const npo = await seed_npo();
    const other = await seed_npo({
      registration_number: "OTHER789",
      slug: "taken-slug",
    });

    // browser-mode msw worker.use() doesn't relay responses through
    // the service worker, so spy on fetch for the slug-check endpoint
    const og_fetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/npos/")) {
        const slug = url.split("/api/npos/")[1]?.split("?")[0];
        if (slug === "taken-slug") {
          return Promise.resolve(
            new Response(JSON.stringify({ id: other.id }), { status: 200 })
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return og_fetch(input, init as RequestInit);
    });

    const screen = await render_edit(npo.id);
    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    const slug_input = screen.getByLabelText(/custom profile url/i);
    await slug_input.fill("taken-slug");

    await screen.getByRole("button", { name: /submit changes/i }).click();

    // error prompt appears → action was blocked, no DB write
    await expect
      .element(screen.getByText(/taken-slug.*already taken/i))
      .toBeInTheDocument();

    vi.restoreAllMocks();
  });
});

describe("edit profile — submit button state", () => {
  it("is disabled when form is not dirty", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();
  });

  it("is disabled again after successful submission", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    // make a change
    const address = screen.getByLabelText(/address/i);
    await address.clear();
    await address.fill("999 New Rd");

    const submit = screen.getByRole("button", { name: /submit changes/i });
    await expect.element(submit).toBeEnabled();

    await submit.click();

    // loader revalidates → useForm receives new values → dirty resets
    await expect
      .element(screen.getByLabelText(/address/i))
      .toHaveDisplayValue("999 New Rd");
    // isDirty resets async — one render after values sync
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeDisabled();
  });
});

describe("edit profile — validation", () => {
  it("rejects empty required fields", async () => {
    const npo = await seed_npo();
    const screen = await render_edit(npo.id);

    await expect.element(screen.getByLabelText(/tagline/i)).toBeVisible();

    // clear required fields
    const tagline = screen.getByLabelText(/tagline/i);
    await tagline.clear();

    const regnum = screen.getByLabelText(/ein.*registration/i);
    await regnum.clear();

    // submit — client-side validation blocks the action
    await screen.getByRole("button", { name: /submit changes/i }).click();

    // form stays on page, submit still enabled (dirty + invalid)
    await expect
      .element(screen.getByRole("button", { name: /submit changes/i }))
      .toBeEnabled();
  });
});
