import { eq } from "drizzle-orm";
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
import { seed_npo } from "#/__tests__/fixtures/funds";
import { donation_settlements, donations } from "$/pg/schema/donation";
import { subscriptions } from "$/pg/schema/subscription";
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

// the reversal is `reverse.test.ts`'s ground; here it is the boundary, so the
// route's own branching on the reversal's answer runs real
const refund = vi.hoisted(() => ({ failures: [] as string[], applied: 0 }));
vi.mock("$/refund/reverse", async (orig) => ({
  ...(await orig<typeof import("$/refund/reverse")>()),
  // holds while a refund is unsent, and flips the donation once nothing
  // failed, as the real one does
  reverse_charge: vi.fn(
    async (r: { donation_id: string; unsent_refunds?: string[] }) => {
      if (r.unsent_refunds?.length) return { status: "held" };
      if (refund.failures.length > 0) {
        return {
          status: "failed",
          reason: "incomplete",
          dists: 1,
          applied: refund.applied,
          failures: refund.failures,
        };
      }
      await test_db
        .current!.db.update(donations)
        .set({ status: "refunded" })
        .where(eq(donations.id, r.donation_id));
      return {
        status: "reversed",
        dists: 1,
        applied: 1,
        owed_msgs: [],
        has_loss: false,
      };
    }
  ),
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
import { reverse_charge } from "$/refund/reverse";
import { action, loader } from "../api";
import Page from "../route";

beforeAll(async () => {
  test_db.current = await create_test_db();
}, 30_000);

afterAll(async () => {
  await test_db.current?.client.close();
});

beforeEach(() => {
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
  refund.failures = [];
  refund.applied = 0;
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

/** an active stripe subscription that billed `payment_intent` */
async function seed_subscription(payment_intent: string) {
  const db = test_db.current!.db;
  const npo = await seed_npo(db, { registration_number: `EIN-REFUND-${++n}` });
  const id = `sub_${n}`;
  await db.insert(subscriptions).values({
    id,
    interval: "month",
    interval_count: 1,
    next_billing: "2026-11-01T00:00:00.000Z",
    amount: 100,
    amount_usd: 100,
    currency: "usd",
    product_id: "prod_1",
    to_npo_id: npo!.id,
    to_name: "Fund Test NPO",
    platform: "stripe",
    status: "active",
    from_id: "donor@example.com",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });
  invoice_payments_list.mockImplementation(async (p: any) => ({
    data:
      p.payment.payment_intent === payment_intent
        ? [
            {
              invoice: {
                parent: { subscription_details: { subscription: id } },
              },
            },
          ]
        : [],
  }));
  return id;
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
  it.each([
    ["succeeded", /stripe refund completed/i],
    ["pending", /reverses once the bank refund succeeds/i],
  ])("reports a %s stripe refund by its status", async (status, wording) => {
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
  });

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
    refund.failures = ["dist dist-1: payout already sent"];
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
    refund.failures = ["dist dist-2: payout already sent"];
    refund.applied = 1;
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

describe("refund api", () => {
  it("leaves every dist unreversed when the Stripe refund errors", async () => {
    refunds_create.mockRejectedValue(new Error("stripe timed out"));
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res.ok).toBe(false);
    expect(res.failures).toEqual([
      "Stripe refund not issued: stripe timed out",
    ]);
    expect(reverse_charge).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a lost connection",
      () =>
        new Stripe.errors.StripeConnectionError({
          message: "socket hang up",
        }),
    ],
    [
      "a 5xx",
      () =>
        new Stripe.errors.StripeAPIError({
          type: "api_error",
          message: "internal error",
          statusCode: 500,
        }),
    ],
  ])("calls the refund unknown, not unissued, after %s", async (_, error) => {
    refunds_create.mockRejectedValue(error());
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: false, refund: "unknown", reversed: 0 });
    expect(reverse_charge).not.toHaveBeenCalled();
  });

  it("tells the admin the refund went out when the reversal throws after it", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    refunds_list
      .mockResolvedValueOnce({ data: [] }) // keying the refund
      .mockRejectedValueOnce(new Error("stripe list timed out"));
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({
      ok: false,
      refund_issued: true,
      refund: "issued",
      reversed: null,
    });
    expect(res.failures).toEqual([
      "Stripe refund re_1 issued, reversal stopped: stripe list timed out",
    ]);
  });

  it("issues a replacement refund when a retry follows a failed one", async () => {
    // stripe's side: a repeated key replays its first refund, and the
    // charge's refunds are listed newest first
    const by_key = new Map<string, object>();
    refunds_create.mockImplementation(
      async (_p: unknown, opts: { idempotencyKey: string }) => {
        const r = by_key.get(opts.idempotencyKey) ?? {
          id: `re_${by_key.size + 1}`,
          status: by_key.size === 0 ? "failed" : "succeeded",
          amount: 10000,
          currency: "usd",
        };
        by_key.set(opts.idempotencyKey, r);
        return r;
      }
    );
    refunds_list.mockImplementation(async () => ({
      data: [...by_key.values()].reverse(),
    }));
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    const args = { params: { donation_id: id } } as any;

    const first: any = await action(args);
    const retry: any = await action(args);

    expect(first).toMatchObject({ ok: false, refund: "not_issued" });
    expect(by_key.size).toBe(2);
    expect(retry).toMatchObject({ ok: true, stripe_refund: "succeeded" });
  });

  it("reverses a replacement refund after a failed one, the failed one neither holding nor counting", async () => {
    const failed = {
      id: "re_failed",
      status: "failed",
      amount: 10000,
      currency: "usd",
      created: 1_700_000_000,
    };
    const ours = {
      ...failed,
      id: "re_full",
      status: "succeeded",
      created: 1_700_000_060,
    };
    refunds_create.mockResolvedValue(ours);
    refunds_list.mockResolvedValue({ data: [ours, failed] });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, reversal: "done" });
    expect(reverse_charge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        share: { taken: 10000, of: 10000 },
        unsent_refunds: [],
      })
    );
  });

  it("sends one idempotency key for two submits racing before any failure", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    refund.failures = ["dist dist-1: db timeout"]; // keeps the donation open
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    const args = { params: { donation_id: id } } as any;

    await Promise.all([action(args), action(args)]);

    const [[, a], [, b]] = refunds_create.mock.calls as any;
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
  });

  it("refunds the donor once across a retried submit", async () => {
    // stripe's idempotency: a repeated key replays the first result
    const issued = new Map<string, { id: string; status: string }>();
    refunds_create.mockImplementation(
      async (_p: unknown, opts?: { idempotencyKey?: string }) => {
        const key = opts?.idempotencyKey ?? crypto.randomUUID();
        const r = issued.get(key) ?? {
          id: `re_${issued.size}`,
          status: "succeeded",
        };
        issued.set(key, r);
        return r;
      }
    );
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    const args = { params: { donation_id: id } } as any;

    refund.failures = ["dist dist-1: db timeout"];
    await action(args);
    refund.failures = [];
    await action(args);

    expect(issued.size).toBe(1);
  });

  it("sizes a refund after an earlier partial at the charge's full figure, not its own remainder", async () => {
    const ours = {
      id: "re_full",
      status: "succeeded",
      amount: 9500,
      currency: "usd",
    };
    const partial = {
      id: "re_part",
      status: "succeeded",
      amount: 500,
      currency: "usd",
    };
    refunds_create.mockResolvedValue(ours);
    refunds_list.mockResolvedValue({ data: [ours, partial] });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, reversal: "done" });
    // whole, so the entry reverses once over what the partial recorded owed
    expect(reverse_charge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        share: { taken: 10000, of: 10000 },
        unsent_refunds: [],
      })
    );
  });

  it("names the Stripe refund as the reversal's source", async () => {
    refunds_create.mockResolvedValue({ id: "re_full", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    await action({ params: { donation_id: id } } as any);

    expect(vi.mocked(reverse_charge).mock.calls[0]![0].source_ref).toBe(
      "re_full"
    );
  });

  it("reverses a paid-grant card gift whole, handing the entry the charge's full share", async () => {
    const ours = {
      id: "re_full",
      status: "succeeded",
      amount: 10000,
      currency: "usd",
    };
    refunds_create.mockResolvedValue(ours);
    refunds_list.mockResolvedValue({ data: [ours] });
    // the paid grant's share recorded as owed, as the entry reports it
    vi.mocked(reverse_charge).mockResolvedValueOnce({
      status: "reversed",
      dists: 1,
      applied: 1,
      owed_msgs: ["npo 7 owes $93.20"],
      has_loss: false,
    });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, reversal: "done" });
    expect(reverse_charge).toHaveBeenCalledExactlyOnceWith({
      donation_id: id,
      rail: "stripe",
      source: "admin",
      share: { taken: 10000, of: 10000 },
      refunds: [{ id: "re_full", amount: 10000 }],
      unsent_refunds: [],
      intent_id: `pi_${id}`,
      source_ref: "re_full",
      alert_from: "refund-action",
      notice: {
        id: "re_full",
        lines: [`payment pi_${id}, admin refund re_full`],
      },
    });
  });

  it("reverses a donation whose charge an earlier attempt already refunded", async () => {
    // past stripe's idempotency window a retry meets the refund it made before
    refunds_create.mockRejectedValue(
      new Stripe.errors.StripeInvalidRequestError({
        type: "invalid_request_error",
        code: "charge_already_refunded",
        message: "Charge ch_1 has already been refunded.",
      })
    );
    refunds_list.mockResolvedValue({
      data: [{ id: "re_earlier", status: "succeeded", amount: 10000 }],
    });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, stripe_refund: "succeeded" });
    expect(reverse_charge).toHaveBeenCalledOnce();
  });

  it("tells the admin the reversal waits on a pending bank refund", async () => {
    refunds_create.mockResolvedValue({
      id: "re_1",
      status: "pending",
      amount: 10000,
    });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({
      ok: true,
      stripe_refund: "pending",
      reversal: "held",
    });
    expect(reverse_charge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ unsent_refunds: ["re_1"] })
    );
  });

  // the entry ends the recurring gift on a whole share, held or not, so the
  // route hands it the payment that billed it
  it("counts a pending full refund toward the whole, so the held reversal still ends the recurring gift", async () => {
    refunds_create.mockResolvedValue({
      id: "re_1",
      status: "pending",
      amount: 10000,
    });
    // a refunded total that leaves the pending refund out
    intents_retrieve.mockResolvedValue({
      latest_charge: { amount_captured: 10000, amount_refunded: 0 },
    });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    await action({ params: { donation_id: id } } as any);

    expect(reverse_charge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        share: { taken: 10000, of: 10000 },
        unsent_refunds: ["re_1"],
        intent_id: `pi_${id}`,
      })
    );
  });

  it("holds the reversal when its own refund succeeded but an earlier one on the charge is pending", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    refunds_list.mockResolvedValue({
      data: [
        { id: "re_1", status: "succeeded", amount: 500 },
        { id: "re_earlier", status: "pending", amount: 9500 },
      ],
    });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, reversal: "held" });
    expect(reverse_charge).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ unsent_refunds: ["re_earlier"] })
    );
  });

  it("reverses a succeeded card refund at once", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({
      ok: true,
      stripe_refund: "succeeded",
      reversal: "done",
    });
    expect(reverse_charge).toHaveBeenCalledOnce();
  });

  it("refuses a stripe donation with no payment on record, reversing nothing", async () => {
    const id = await seed_donation();

    const res = await action({ params: { donation_id: id } } as any).catch(
      (r: unknown) => r
    );

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(reverse_charge).not.toHaveBeenCalled();
  });

  it("answers already refunded for a gift reversed before its refund, issuing none", async () => {
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    await test_db
      .current!.db.update(donations)
      .set({ status: "refunded" })
      .where(eq(donations.id, id));

    const res = await action({ params: { donation_id: id } } as any).catch(
      (r: unknown) => r
    );

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).text()).toBe("already refunded");
    expect(refunds_create).not.toHaveBeenCalled();
  });

  it("reports the refund processed when its own charge.refunded webhook reversed the gift first", async () => {
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    // the webhook backstop lands between the refund and this request's reversal
    refunds_create.mockImplementation(async () => {
      await test_db
        .current!.db.update(donations)
        .set({ status: "refunded" })
        .where(eq(donations.id, id));
      return { id: "re_1", status: "succeeded" };
    });
    vi.mocked(reverse_charge).mockResolvedValueOnce({
      status: "already_reversed",
      donation_status: "refunded",
    });

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({
      ok: true,
      stripe_refund: "succeeded",
      reversal: "done",
    });
  });

  it("checks the gift has dists without planning their reversal before the refund", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, reversal: "done" });
    expect(load_refund_plan).not.toHaveBeenCalled();
  });

  it("refuses a gift with no settled dists, issuing no refund", async () => {
    vi.mocked(dists_for_refund).mockResolvedValue([]);
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res = await action({ params: { donation_id: id } } as any).catch(
      (r: unknown) => r
    );

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(await (res as Response).text()).toBe("no settled dists");
    expect(refunds_create).not.toHaveBeenCalled();
  });

  // `reverse_charge` ends it, ahead of the reversal and whatever becomes of it
  it("leaves ending a recurring gift's billing to the reversal once the refund succeeds", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    await seed_subscription(`pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: true, reversal: "done" });
    expect(reverse_charge).toHaveBeenCalledWith(
      expect.objectContaining({ rail: "stripe", source: "admin" })
    );
    expect(
      enqueue.mock.calls.flat().filter((m) => m.id === "sub-deactivated")
    ).toEqual([]);
  });

  it.each(["nowpayments:crypto", "paypal:paypal", "chariot:daf"])(
    "refuses a %s donation in loader and action, reversing nothing",
    async (via) => {
      const id = await seed_donation(via);
      await seed_settlement(id, `sttl_${id}`);
      const args = { params: { donation_id: id } } as any;

      const from_loader = await loader(args).catch((r: unknown) => r);
      const from_action = await action(args).catch((r: unknown) => r);

      expect(from_loader).toBeInstanceOf(Response);
      expect((from_loader as Response).status).toBe(400);
      expect(from_action).toBeInstanceOf(Response);
      expect((from_action as Response).status).toBe(400);
      expect(reverse_charge).not.toHaveBeenCalled();
      expect(refunds_create).not.toHaveBeenCalled();
    }
  );
});
