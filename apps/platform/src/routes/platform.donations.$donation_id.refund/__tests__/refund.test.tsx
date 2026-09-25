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
import { donation_settlements, donations } from "$/pg/schema/donation";
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

vi.mock("#/.server/toast", () => ({
  // merged, not wrapped: the real helper hands the payload straight back and
  // carries the message in a cookie header, so `fetcher.data` has this shape
  dataWithSuccess: vi.fn((data, toast) => ({ ...data, toast })),
  dataWithError: vi.fn((data, toast) => ({ ...data, toast })),
}));

const refunds_create = vi.hoisted(() => vi.fn());
vi.mock("$/kit/stripe", () => ({
  stripe: {
    refunds: { create: refunds_create },
    invoicePayments: { list: vi.fn(async () => ({ data: [] })) },
  },
}));
vi.mock("$/kit/queue", () => ({ enqueue: vi.fn() }));

// the dist graph and its reversal are `process.test.ts`'s ground; here they are
// the boundary, so the route's own branching on the reversal's answer runs real
const refund = vi.hoisted(() => ({ failures: [] as string[] }));
vi.mock("$/refund/process", () => ({
  load_refund_plan: vi.fn(async () => ({
    preview: {
      effects: [{ label: "Reverse payout", pass: true }],
      blockers: [],
      warnings: [],
    },
  })),
  process_refund: vi.fn(async () => ({
    failures: refund.failures,
    loss_msgs: [],
    has_loss: false,
    applied: 0,
  })),
}));
vi.mock("$/pg/queries/dist", async (orig) => ({
  ...(await orig<typeof import("$/pg/queries/dist")>()),
  dists_for_refund: vi.fn(async () => [
    {
      dist: {
        id: "dist-1",
        to_id: 7,
        to_name: "Save the Whales",
        amount: 100,
        net: 95,
        refund_status: null,
      },
    },
  ]),
}));

import { create_test_db } from "$/pg/test-utils/pglite";
import { action, loader } from "../api";
import Page from "../route";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
  refund.failures = [];
});

let n = 0;
async function seed_donation() {
  const id = `don_${++n}`;
  await test_db.current!.db.insert(donations).values({
    id,
    upusd: 1,
    status: "settled",
    amount_base: 100,
    amount_tip: 0,
    amount_fee_allowance: 0,
    currency: "USD",
    frequency: "one-time",
    source: "bg-marketplace",
    via: "nowpayments:crypto",
  });
  return id;
}

async function seed_settlement(donation_id: string, sttl_id: string) {
  await test_db.current!.db.insert(donation_settlements).values({
    donation_id,
    sttl_id,
    date: new Date().toISOString(),
    currency: "USD",
    net: 95,
    fee: 5,
  });
}

async function open_and_confirm(donation_id: string) {
  const Stub = createRoutesStub([
    {
      path: "/platform/donations/:donation_id/refund",
      Component: Page,
      HydrateFallback: () => null,
      loader: loader as any,
      action: action as any,
    },
  ]);
  const screen = await render(
    <Stub initialEntries={[`/platform/donations/${donation_id}/refund`]} />
  );
  const confirm = screen.getByRole("button", { name: /confirm refund/i });
  await expect.element(confirm).toBeEnabled();
  (confirm.element() as HTMLElement).click();
  return screen;
}

describe("refund modal", () => {
  it("reports a refund with no settlement to charge back as records-only", async () => {
    const id = await seed_donation();

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByText("Refund processed"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText(/no money was moved/i))
      .toBeInTheDocument();
    expect(screen.getByText(/stripe refund issued/i).query()).toBeNull();
    expect(refunds_create).not.toHaveBeenCalled();
  });

  it("reports the stripe refund when the settlement's payment was refunded", async () => {
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByText(/stripe refund issued/i))
      .toBeInTheDocument();
    expect(screen.getByText(/no money was moved/i).query()).toBeNull();
    expect(refunds_create).toHaveBeenCalledWith({ payment_intent: `pi_${id}` });
  });

  it("keeps a refund with a failed reversal open, listing what failed", async () => {
    refund.failures = ["dist dist-1: payout already sent"];
    const id = await seed_donation();

    const screen = await open_and_confirm(id);

    const alert = screen.getByRole("alert");
    await expect
      .element(alert)
      .toMatchTextContent(/no stripe refund was issued/i);
    await expect
      .element(alert)
      .toMatchTextContent("dist dist-1: payout already sent");
    expect(screen.getByText("Refund processed").query()).toBeNull();
    expect(refunds_create).not.toHaveBeenCalled();
  });
});
