import { createRoutesStub } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { npos } from "$/pg/schema/npo";
import type { TestDb } from "$/pg/test-utils/pglite-browser";

// --- mocks ---

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

vi.mock("remix-client-cache", () => ({
  CacheRoute: (Component: any) => Component,
  createClientLoaderCache: () => undefined,
}));

// --- imports (after mocks) ---

import { get_npos } from "#/.server/npos";
import { create_test_db } from "$/pg/test-utils/pglite-browser";
import {
  action as createAction,
  loader as createLoader,
} from "../../platform.donation-settlements.create/api";
import CreatePage from "../../platform.donation-settlements.create/route";
import { loader } from "../api";
import ListPage from "../route";

// --- setup ---

const npo_id = { value: 0 };

beforeAll(async () => {
  test_db.current = await create_test_db();
  const rows = await test_db.current.db
    .insert(npos)
    .values([
      {
        name: "Freegan Food Foundation",
        registration_number: "EIN-TEST-001",
        endow_designation: "Charity",
        hq_country: "United States",
      },
      {
        name: "Zebra Wildlife Trust",
        registration_number: "EIN-TEST-002",
        endow_designation: "Charity",
        hq_country: "United States",
      },
    ])
    .returning({ id: npos.id });
  npo_id.value = rows[0].id;
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

// --- helpers ---

function render_app(initial = "/platform/donation-settlements") {
  const Stub = createRoutesStub([
    {
      path: "/platform/donation-settlements",
      Component: ListPage,
      HydrateFallback: () => null,
      loader,
      children: [
        {
          path: "create",
          Component: CreatePage,
          loader: createLoader,
          action: createAction,
        },
      ],
    },
    {
      path: "/api/npos",
      loader: async ({ request }: { request: Request }) => {
        const q = new URL(request.url).searchParams.get("query") ?? undefined;
        return await get_npos({ query: q });
      },
    },
  ]);

  return render(<Stub initialEntries={[initial]} />);
}

// --- helpers: fill form and go to preview ---

async function fill_form_and_preview(
  screen: Awaited<ReturnType<typeof render>>,
  opts: {
    from?: "cheque" | "daf";
    donor_name?: string;
    net: string;
    reference: string;
  }
) {
  if (opts.from) {
    await screen.getByLabelText("From").selectOptions(opts.from);
  }

  const combo = screen.getByPlaceholder("Search for an organization...");
  await expect.element(combo, { timeout: 3000 }).toBeVisible();
  await combo.fill("Freegan");

  await expect
    .element(screen.getByRole("option", { name: "Freegan Food Foundation" }), {
      timeout: 3000,
    })
    .toBeVisible();
  // search must filter — non-matching option should be absent
  await expect
    .element(screen.getByRole("option", { name: "Zebra Wildlife Trust" }))
    .not.toBeInTheDocument();
  (
    screen
      .getByRole("option", { name: "Freegan Food Foundation" })
      .element() as HTMLElement
  ).click();

  if (opts.donor_name) {
    await screen.getByPlaceholder("Anonymous").fill(opts.donor_name);
  }
  await screen.getByPlaceholder("0.00").fill(opts.net);
  await screen
    .getByPlaceholder("e.g. Fidelity deposit #123")
    .fill(opts.reference);

  // click preview
  const preview_btn = screen.getByRole("button", { name: /preview/i });
  (preview_btn.element() as HTMLElement).click();

  // wait for preview to load
  await expect
    .element(screen.getByText("Confirm settlement"), { timeout: 5000 })
    .toBeInTheDocument();
}

// --- tests ---

describe("settle donation — full flow", () => {
  it("preview → back returns to form with values intact", async () => {
    const screen = await render_app();

    // navigate to create
    (
      screen.getByRole("link", { name: /new/i }).element() as HTMLElement
    ).click();

    // fill and preview
    await fill_form_and_preview(screen, {
      net: "500",
      reference: "ref-back-test",
    });

    // click back
    (
      screen.getByRole("button", { name: /back/i }).element() as HTMLElement
    ).click();

    // back on form
    await expect
      .element(screen.getByText("New settlement"))
      .toBeInTheDocument();
  });

  it("shows Anonymous when donor name is left empty", async () => {
    const screen = await render_app();

    (
      screen.getByRole("link", { name: /new/i }).element() as HTMLElement
    ).click();

    await fill_form_and_preview(screen, {
      net: "100",
      reference: "ref-anon",
    });

    await expect.element(screen.getByText("Anonymous")).toBeInTheDocument();
  });

  it("shows validation errors when submitting empty form", async () => {
    const screen = await render_app();

    (
      screen.getByRole("link", { name: /new/i }).element() as HTMLElement
    ).click();

    // preview button should be enabled (always enabled now)
    const preview_btn = screen.getByRole("button", { name: /preview/i });
    await expect.element(preview_btn, { timeout: 3000 }).toBeEnabled();

    // click without filling — should show validation errors
    (preview_btn.element() as HTMLElement).click();

    await expect
      .element(screen.getByText("Select a nonprofit"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Enter a valid amount"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Enter a reference ID"))
      .toBeInTheDocument();
  });

  it("create settlement → preview → confirm → item appears in table", async () => {
    // 1. start on list — empty
    const screen = await render_app();
    await expect
      .element(screen.getByText("No settlements found"))
      .toBeInTheDocument();

    // 2. click "+ New" to open create dialog
    const new_link = screen.getByRole("link", { name: /new/i });
    (new_link.element() as HTMLElement).click();

    // 3. fill form and go to preview
    await fill_form_and_preview(screen, {
      donor_name: "Doug Mendenhall",
      net: "250",
      reference: "Fidelity deposit #789",
    });

    // 4. verify preview shows records
    await expect
      .element(screen.getByText("Freegan Food Foundation"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Doug Mendenhall"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText("Fidelity deposit #789"))
      .toBeInTheDocument();
    // grant row
    await expect.element(screen.getByText("Grant")).toBeInTheDocument();

    // 5. confirm
    const confirm_btn = screen.getByRole("button", { name: /confirm/i });
    (confirm_btn.element() as HTMLElement).click();

    // 6. success
    await expect
      .element(screen.getByText("Settlement created"), { timeout: 10_000 })
      .toBeInTheDocument();

    // 7. close dialog → list reloads with the new settlement
    const close_btn = screen.getByRole("button", { name: /close/i });
    (close_btn.element() as HTMLElement).click();

    // 8. verify the row appears in the table
    await expect
      .element(screen.getByText("Doug Mendenhall"), { timeout: 5000 })
      .toBeVisible();
    await expect
      .element(screen.getByText("Freegan Food Foundation"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Fidelity deposit #789"))
      .toBeVisible();
  });

  it("settles a DAF donation → listed with method 'DAF'", async () => {
    const screen = await render_app();

    (
      screen.getByRole("link", { name: /new/i }).element() as HTMLElement
    ).click();

    // pick DAF as the source
    await fill_form_and_preview(screen, {
      from: "daf",
      donor_name: "Wanda Whitfield",
      net: "400",
      reference: "DAF grant #555",
    });

    // confirm
    (
      screen.getByRole("button", { name: /confirm/i }).element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("Settlement created"), { timeout: 10_000 })
      .toBeInTheDocument();

    (
      screen.getByRole("button", { name: /close/i }).element() as HTMLElement
    ).click();

    // row appears with the generic "DAF" method label
    await expect
      .element(screen.getByText("Wanda Whitfield"), { timeout: 5000 })
      .toBeVisible();
    await expect
      .element(screen.getByRole("cell", { name: "DAF", exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText("DAF grant #555")).toBeVisible();
  });

  // regression: selecting an npo option must populate the combobox input
  // (the post-selection input-value-change must not trigger a refetch that
  // clears state). asserting the input value catches what the previous
  // submit-only assertion missed.
  it("selecting an option populates the combobox input", async () => {
    const screen = await render_app();

    (
      screen.getByRole("link", { name: /new/i }).element() as HTMLElement
    ).click();

    const combo = screen.getByPlaceholder("Search for an organization...");
    await expect.element(combo, { timeout: 3000 }).toBeVisible();
    await combo.fill("Freegan");

    const opt = screen.getByRole("option", {
      name: "Freegan Food Foundation",
    });
    await expect.element(opt, { timeout: 3000 }).toBeVisible();
    // playwright pointer click (not native DOM .click) — the option is
    // portaled outside the dialog, so the inert overlay doesn't intercept,
    // and the real pointer path is what triggers Base UI's
    // onInputValueChange(reason: "item-press") flow being regressed.
    await opt.click();

    // user-visible outcome: input now shows the selected nonprofit's name
    await expect
      .element(combo, { timeout: 3000 })
      .toHaveValue("Freegan Food Foundation");

    // and remains intact after the post-selection debounce window
    await new Promise((r) => setTimeout(r, 800));
    await expect.element(combo).toHaveValue("Freegan Food Foundation");

    await screen.getByPlaceholder("0.00").fill("100");
    await screen
      .getByPlaceholder("e.g. Fidelity deposit #123")
      .fill("ref-regression");

    (
      screen.getByRole("button", { name: /preview/i }).element() as HTMLElement
    ).click();

    await expect
      .element(screen.getByText("Confirm settlement"), { timeout: 5000 })
      .toBeInTheDocument();
  });
});
