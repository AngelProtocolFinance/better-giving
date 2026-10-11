import { createRoutesStub } from "react-router";
import Stripe from "stripe";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
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
const refunds_list = vi.hoisted(() => vi.fn());
const refunds_retrieve = vi.hoisted(() => vi.fn());
const intents_retrieve = vi.hoisted(() => vi.fn());
const invoice_payments_list = vi.hoisted(() =>
  vi.fn(async (_p: unknown): Promise<{ data: unknown[] }> => ({ data: [] }))
);
vi.mock("$/kit/stripe", () => ({
  stripe: {
    refunds: {
      create: refunds_create,
      list: refunds_list,
      retrieve: refunds_retrieve,
    },
    paymentIntents: { retrieve: intents_retrieve },
    invoicePayments: { list: invoice_payments_list },
  },
}));
const enqueue = vi.hoisted(() => vi.fn(async (_m: any) => undefined));
vi.mock("$/kit/queue", () => ({ enqueue }));
const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

// the reversal is `reverse.test.ts`'s ground, and `action.test.ts` runs it for
// real; here it is the boundary, so the modal shows what each test says it
// answered
vi.mock("$/refund/reverse", async (orig) => ({
  ...(await orig<typeof import("$/refund/reverse")>()),
  reverse_charge: vi.fn(),
}));
// the preview's plan per dist. browser mode links every named import the real
// `reverse` module makes, so `process_refund` is stubbed though never reached
vi.mock("$/refund/process", () => ({
  load_refund_plan: vi.fn(async () => ({
    amount: [],
    preview: {
      effects: [{ label: "Reverse payout", pass: true }],
      blockers: [],
      warnings: [],
    },
  })),
  process_refund: vi.fn(),
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

import { dists_for_refund } from "$/pg/queries/dist";
import { create_test_db } from "$/pg/test-utils/pglite";
import { load_refund_plan } from "$/refund/process";
import { type ReversalResult, reverse_charge } from "$/refund/reverse";
import { action, loader } from "../api";
import Page from "../route";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

const reversed: ReversalResult = {
  status: "reversed",
  dists: 1,
  applied: 1,
  owed_msgs: [],
  has_loss: false,
};

const incomplete = (failures: string[], applied = 0): ReversalResult => ({
  status: "failed",
  reason: "incomplete",
  dists: 1,
  applied,
  failures,
});

beforeEach(() => {
  vi.mocked(reverse_charge).mockResolvedValue(reversed);
  refunds_list.mockResolvedValue({ data: [] });
  // no refunded total: the share is summed off the refund list
  intents_retrieve.mockResolvedValue({
    latest_charge: { amount_captured: 10000 },
  });
  // unless a test says otherwise, the refund stands as stripe created it
  refunds_retrieve.mockImplementation(async (id: string) => ({
    ...refunds_create.mock.settledResults.at(-1)?.value,
    id,
  }));
});

afterEach(async () => {
  await cleanup();
  // reset, not cleared: an implementation one test sets must not carry into the next
  vi.resetAllMocks();
});

let n = 0;
async function seed_donation(via = "stripe:card") {
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
    via,
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
  it.each<[string, RegExp, ReversalResult]>([
    ["succeeded", /stripe refund completed/i, reversed],
    ["pending", /reverses once the bank refund succeeds/i, { status: "held" }],
  ])(
    "reports a %s stripe refund by its status",
    async (status, wording, answer) => {
      vi.mocked(reverse_charge).mockResolvedValue(answer);
      refunds_create.mockResolvedValue({ id: "re_1", status });
      const id = await seed_donation();
      await seed_settlement(id, `pi_${id}`);

      const screen = await open_and_confirm(id);

      await expect.element(screen.getByText(wording)).toBeInTheDocument();
      const others = [
        /stripe refund completed/i,
        /reverses once the bank refund succeeds/i,
      ].filter((w) => String(w) !== String(wording));
      for (const w of others) expect(screen.getByText(w).query()).toBeNull();
      expect(refunds_create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: `pi_${id}` }),
        expect.anything()
      );
    }
  );

  it("moves focus to the outcome heading once the refund is processed", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByRole("heading", { name: "Refund processed" }))
      .toHaveFocus();
  });

  it.each(["failed", "canceled"])(
    "reverses nothing when stripe returns the refund %s",
    async (status) => {
      refunds_create.mockResolvedValue({ id: "re_1", status });
      const id = await seed_donation();
      await seed_settlement(id, `pi_${id}`);

      const screen = await open_and_confirm(id);

      const alert = screen.getByRole("alert");
      await expect
        .element(alert)
        .toMatchTextContent(`Stripe refund re_1 is ${status}`);
      expect(screen.getByText("Refund processed").query()).toBeNull();
      expect(reverse_charge).not.toHaveBeenCalled();
    }
  );

  it("says a retry is fine now when only the refund lookup before creating failed", async () => {
    refunds_list.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" })
    );
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    const alert = screen.getByRole("alert");
    await expect
      .element(alert)
      .toMatchTextContent(
        /this attempt made no refund because looking up earlier refunds failed/i
      );
    await expect.element(alert).toMatchTextContent(/retrying now is safe/i);
    expect(alert.element().textContent).not.toMatch(/24 hours/);
    expect(refunds_create).not.toHaveBeenCalled();
  });

  it("says a retry within 24 hours gets the same answer when the refund create was unconfirmed", async () => {
    refunds_create.mockRejectedValue(
      new Stripe.errors.StripeConnectionError({ message: "socket hang up" })
    );
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent(/a retry within 24 hours gets the same answer back/i);
  });

  it("reverses nothing when a replayed refund has since failed", async () => {
    // a replay hands back the first response, not the refund as it stands
    refunds_create.mockResolvedValue({ id: "re_1", status: "pending" });
    refunds_retrieve.mockResolvedValue({ id: "re_1", status: "failed" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByRole("alert"))
      .toMatchTextContent("Stripe refund re_1 is failed");
    expect(reverse_charge).not.toHaveBeenCalled();
  });

  it("reverses nothing while the stripe refund needs action, and says to retry", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "requires_action" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    const alert = screen.getByRole("alert");
    await expect.element(alert).toMatchTextContent(/re_1 needs action/i);
    await expect.element(alert).toMatchTextContent(/nothing was reversed/i);
    await expect.element(alert).toMatchTextContent(/retry/i);
    expect(reverse_charge).not.toHaveBeenCalled();
  });

  it("keeps a refund with a failed reversal open, listing what failed", async () => {
    vi.mocked(reverse_charge).mockResolvedValue(
      incomplete(["dist dist-1: payout already sent"])
    );
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    const alert = screen.getByRole("alert");
    await expect
      .element(alert)
      .toMatchTextContent(/the stripe refund was issued/i);
    await expect
      .element(alert)
      .toMatchTextContent("dist dist-1: payout already sent");
    expect(screen.getByText("Refund processed").query()).toBeNull();
  });

  it("lets the admin retry a dist whose reversal failed before", async () => {
    vi.mocked(dists_for_refund).mockResolvedValue([
      {
        dist: {
          id: "dist-1",
          to_id: 7,
          to_name: "Save the Whales",
          amount: 100,
          net: 95,
          refund_status: "failed",
          refund_error: "payout already sent",
        },
      },
    ] as any);
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByText("Refund processed"))
      .toBeInTheDocument();
    expect(reverse_charge).toHaveBeenCalledOnce();
  });

  it("says how many dists were reversed when only some were", async () => {
    vi.mocked(reverse_charge).mockResolvedValue(
      incomplete(["dist dist-2: payout already sent"], 1)
    );
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    const alert = screen.getByRole("alert");
    await expect
      .element(alert)
      .toMatchTextContent(/1 distribution\(s\) were reversed/);
    expect(alert.element().textContent).not.toMatch(/nothing was reversed/i);
  });
});

describe("refund preview", () => {
  // ¥50,000 gift pledged at $333.33 that settled at $313.50: the row's $
  // column shows the settled usd, the money the refund moves
  const yen_dist = (refund_status: string | null) => ({
    dist: {
      id: "dist-1",
      to_id: 7,
      to_name: "Save the Whales",
      amount: 50_000,
      amount_usd: 333.33,
      net: 300,
      fee_base: 0,
      fee_fsa: 0,
      fee_processing: 13.5,
      refund_status,
    },
  });

  it("shows a non-USD dist's settled amount in USD", async () => {
    vi.mocked(dists_for_refund).mockResolvedValue([yen_dist(null)] as any);
    vi.mocked(load_refund_plan).mockResolvedValue({
      is_loss: false,
      amount: [],
      preview: { effects: [], blockers: [], warnings: [] },
    } as any);
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const data: any = await loader({ params: { donation_id: id } } as any);

    expect(data.previews[0].amount).toBe(313.5);
  });

  it("shows an already-reversed non-USD dist's settled amount in USD", async () => {
    vi.mocked(dists_for_refund).mockResolvedValue([yen_dist("loss")] as any);
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const data: any = await loader({ params: { donation_id: id } } as any);

    expect(data.previews[0].amount).toBe(313.5);
  });

  it("shows a dist already refunded after its grant as recorded as owed, not a loss", async () => {
    vi.mocked(dists_for_refund).mockResolvedValue([yen_dist("loss")] as any);
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    const Stub = createRoutesStub([
      {
        path: "/platform/donations/:donation_id/refund",
        Component: Page,
        HydrateFallback: () => null,
        loader: loader as any,
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/donations/${id}/refund`]} />
    );

    await expect
      .element(screen.getByText("Recorded as owed", { exact: true }))
      .toBeInTheDocument();
    expect(screen.getByText("Completed with losses").query()).toBeNull();
  });

  it("says a paid grant will be recovered from the npo's future grants, not lost", async () => {
    vi.mocked(load_refund_plan).mockResolvedValue({
      is_loss: true,
      amount: [{ party: { npo_id: 7 }, usd: 93.2 }],
      preview: {
        effects: [],
        blockers: [],
        warnings: [{ label: "Grant payout", pass: false, reason: "settled" }],
      },
    } as any);
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    const Stub = createRoutesStub([
      {
        path: "/platform/donations/:donation_id/refund",
        Component: Page,
        HydrateFallback: () => null,
        loader: loader as any,
      },
    ]);

    const screen = await render(
      <Stub initialEntries={[`/platform/donations/${id}/refund`]} />
    );

    await expect
      .element(
        screen.getByText(
          "$93.20 will be recovered from Save the Whales's future grants"
        )
      )
      .toBeInTheDocument();
    expect(screen.getByText("will be a platform loss").query()).toBeNull();
    await expect
      .element(screen.getByRole("button", { name: /confirm refund/i }))
      .toHaveTextContent("Confirm refund");
  });
});
