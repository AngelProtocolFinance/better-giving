import { createRoutesStub } from "react-router";
import Stripe from "stripe";
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
const refunds_list = vi.hoisted(() => vi.fn());
vi.mock("$/kit/stripe", () => ({
  stripe: {
    refunds: { create: refunds_create, list: refunds_list },
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
import { process_refund } from "$/refund/process";
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
  it("reports a refund with no settlement to charge back as records-only", async () => {
    const id = await seed_donation();

    const screen = await open_and_confirm(id);

    await expect
      .element(screen.getByText("Refund processed"))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText(/no money was moved/i))
      .toBeInTheDocument();
    expect(screen.getByText(/stripe refund completed/i).query()).toBeNull();
    expect(refunds_create).not.toHaveBeenCalled();
  });

  it.each([
    ["succeeded", /stripe refund completed/i],
    ["pending", /awaiting stripe/i],
    ["requires_action", /awaiting stripe/i],
  ])("reports a %s stripe refund by its status", async (status, wording) => {
    refunds_create.mockResolvedValue({ id: "re_1", status });
    const id = await seed_donation();
    await seed_settlement(id, `pi_${id}`);

    const screen = await open_and_confirm(id);

    await expect.element(screen.getByText(wording)).toBeInTheDocument();
    const others = [
      /stripe refund completed/i,
      /awaiting stripe/i,
      /no money was moved/i,
    ].filter((w) => String(w) !== String(wording));
    for (const w of others) expect(screen.getByText(w).query()).toBeNull();
    expect(refunds_create).toHaveBeenCalledWith(
      { payment_intent: `pi_${id}` },
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

    await action(args);
    await action(args);

    expect(issued.size).toBe(1);
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
