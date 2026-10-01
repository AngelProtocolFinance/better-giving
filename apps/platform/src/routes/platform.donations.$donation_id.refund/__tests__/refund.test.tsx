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
    invoicePayments: { list: invoice_payments_list },
  },
}));
const enqueue = vi.hoisted(() => vi.fn(async (_m: any) => undefined));
vi.mock("$/kit/queue", () => ({ enqueue }));
const report_error = vi.hoisted(() => vi.fn());
vi.mock("#/errors/report", () => ({ report_error }));

// the dist graph and its reversal are `process.test.ts`'s ground; here they are
// the boundary, so the route's own branching on the reversal's answer runs real
const refund = vi.hoisted(() => ({ failures: [] as string[], applied: 0 }));
vi.mock("$/refund/process", () => ({
  load_refund_plan: vi.fn(async () => ({
    preview: {
      effects: [{ label: "Reverse payout", pass: true }],
      blockers: [],
      warnings: [],
    },
  })),
  // flips the donation as the real one does once nothing failed
  process_refund: vi.fn(async (donation_id: string) => {
    if (refund.failures.length === 0) {
      await test_db
        .current!.db.update(donations)
        .set({ status: "refunded" })
        .where(eq(donations.id, donation_id));
    }
    return {
      failures: refund.failures,
      loss_msgs: [],
      has_loss: false,
      applied: refund.applied,
    };
  }),
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
import { process_refund } from "$/refund/process";
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
    ["pending", /awaiting stripe/i],
  ])("reports a %s stripe refund by its status", async (status, wording) => {
    refunds_create.mockResolvedValue({ id: "re_1", status });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect.element(screen.getByText(wording)).toBeInTheDocument();
    const others = [/stripe refund completed/i, /awaiting stripe/i].filter(
      (w) => String(w) !== String(wording)
    );
    for (const w of others) expect(screen.getByText(w).query()).toBeNull();
    expect(refunds_create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: `pi_${id}` }),
      expect.anything()
    );
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
      expect(process_refund).not.toHaveBeenCalled();
    }
  );

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
    expect(process_refund).not.toHaveBeenCalled();
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
    expect(process_refund).not.toHaveBeenCalled();
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
    expect(process_refund).toHaveBeenCalledOnce();
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
    expect(process_refund).not.toHaveBeenCalled();
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
    expect(process_refund).not.toHaveBeenCalled();
  });

  it("tells the admin the refund went out when the reversal throws after it", async () => {
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    refunds_list.mockRejectedValue(new Error("stripe list timed out"));
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
      "Stripe refund re_1 was issued, then: stripe list timed out",
    ]);
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

  it("tells ops to undo their hand adjustment when earlier partial refunds exist", async () => {
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

    await action({ params: { donation_id: id } } as any);

    const [starting, notice] = enqueue.mock.calls
      .flat()
      .filter((m) => m.id === "fiat-notice");
    expect(starting.payload.alert.title).toBe(
      "Full Refund After Partial: Reversal Starting"
    );
    expect(starting.payload.alert.body).toContain(
      "earlier partial refunds: 5.00 USD (re_part, succeeded)"
    );
    expect(notice.payload.alert.title).toBe(
      "Reversal Complete: Undo Hand Adjustment"
    );
    expect(notice.payload.alert.body).toContain(
      "completing refund: 95.00 USD (re_full, succeeded)"
    );
    const [starting_at] = enqueue.mock.invocationCallOrder;
    const [reversed_at] = vi.mocked(process_refund).mock.invocationCallOrder;
    expect(starting_at).toBeLessThan(reversed_at);
  });

  it("tells ops to keep their hand adjustment when the reversal after partials fails", async () => {
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
    refund.failures = ["dist dist-1: payout already sent"];
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    await action({ params: { donation_id: id } } as any);

    const notices = enqueue.mock.calls
      .flat()
      .filter((m) => m.id === "fiat-notice");
    expect(notices).toHaveLength(2);
    const [, notice] = notices;
    expect(notice.payload.alert.title).toBe(
      "Reversal Did Not Complete: Keep Hand Adjustment"
    );
    expect(notice.payload.alert.body).toContain(
      "1 of 1 dists failed to reverse"
    );
    // the key the webhook would use for the same refund, so the two never both land
    expect(notice.dedupe).toBe("fiat.notice_re_full_keep");
  });

  it("still reports the refund processed when its outcome notice can't be queued, keeping the instruction in sentry", async () => {
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
    enqueue
      .mockResolvedValueOnce(undefined) // the start notice
      .mockRejectedValueOnce(new Error("qstash 503"));
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res.ok).toBe(true);
    expect(report_error).toHaveBeenCalledOnce();
    const [err, ctx] = report_error.mock.calls[0]!;
    expect(err).toMatchObject({ message: "qstash 503" });
    expect(ctx).toMatchObject({
      donation_id: id,
      title: "Reversal Complete: Undo Hand Adjustment",
    });
  });

  it("posts no partial-refund notice when the admin refund is the charge's only one", async () => {
    const ours = {
      id: "re_full",
      status: "succeeded",
      amount: 10000,
      currency: "usd",
    };
    refunds_create.mockResolvedValue(ours);
    refunds_list.mockResolvedValue({ data: [ours] });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res.ok).toBe(true);
    expect(refunds_list).toHaveBeenCalled();
    expect(
      enqueue.mock.calls.flat().filter((m) => m.id === "fiat-notice")
    ).toEqual([]);
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
    expect(process_refund).toHaveBeenCalledOnce();
  });

  it("refuses a stripe donation with no payment on record, reversing nothing", async () => {
    const id = await seed_donation();

    const res = await action({ params: { donation_id: id } } as any).catch(
      (r: unknown) => r
    );

    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(400);
    expect(process_refund).not.toHaveBeenCalled();
  });

  it("stops a recurring gift's billing once refunded, though a dist failed to reverse", async () => {
    refund.failures = ["dist dist-1: payout already sent"];
    refunds_create.mockResolvedValue({ id: "re_1", status: "succeeded" });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);
    const sub_id = await seed_subscription(`pi_${id}`);

    const res: any = await action({ params: { donation_id: id } } as any);

    expect(res).toMatchObject({ ok: false, refund_issued: true });
    const [deactivated] = enqueue.mock.calls
      .flat()
      .filter((m) => m.id === "sub-deactivated");
    expect(deactivated?.payload).toMatchObject({
      id: sub_id,
      status: "inactive",
      status_cancel_reason: "refunded",
    });
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
      expect(process_refund).not.toHaveBeenCalled();
      expect(refunds_create).not.toHaveBeenCalled();
    }
  );
});
