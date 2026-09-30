import { beforeEach, describe, expect, it, vi } from "vitest";

const intent_retrieve_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const donation_by_sttl_id_mock = vi.hoisted(() => vi.fn());
const dists_for_refund_mock = vi.hoisted(() => vi.fn());
const process_refund_mock = vi.hoisted(() => vi.fn());
const send_alert_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/stripe", () => ({
  stripe: {
    paymentIntents: { retrieve: intent_retrieve_mock },
    charges: { retrieve: charge_retrieve_mock },
    refunds: { list: refunds_list_mock },
  },
}));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: donation_get_mock,
  donation_by_sttl_id: donation_by_sttl_id_mock,
}));
vi.mock("$/pg/queries/dist", () => ({
  dists_for_refund: dists_for_refund_mock,
}));
vi.mock("$/refund/process", () => ({ process_refund: process_refund_mock }));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));

const { handle_dispute_created, handle_dispute_closed } = await import(
  "./charge-dispute"
);

const DON_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";
const graph = { dist: { id: "dist_1" } };
let don_status = "settled";
/** stripe's side of the $100 charge: refunds made before the dispute, newest first */
let refunds: { id: string; amount: number; status: string }[] = [];

const dispute_event = (type: string, status: string, amount = 10_000) =>
  ({
    id: `evt_${type}`,
    type,
    data: {
      object: {
        id: "dp_1",
        amount,
        currency: "usd",
        charge: "ch_1",
        payment_intent: "pi_1",
        reason: "fraudulent",
        status,
        evidence_details: { due_by: 1_767_225_600 },
        balance_transactions: [
          { id: "txn_1", amount: -10_000, fee: 1_500, currency: "usd" },
        ],
      },
    },
  }) as any;

const alerts = () => send_alert_mock.mock.calls.map(([a]) => a);
const queued = () =>
  enqueue_mock.mock.calls.flat().filter((m) => m.id === "fiat-notice");

beforeEach(() => {
  vi.clearAllMocks();
  don_status = "settled";
  refunds = [];
  charge_retrieve_mock.mockImplementation(async () => ({
    id: "ch_1",
    amount: 10_000,
    currency: "usd",
    amount_refunded: refunds
      .filter((r) => r.status !== "failed")
      .reduce((sum, r) => sum + r.amount, 0),
  }));
  refunds_list_mock.mockImplementation(async () => ({ data: [...refunds] }));
  donation_by_sttl_id_mock.mockImplementation(async () => ({
    id: DON_ID,
    status: don_status,
    form_id: "form-1",
    program: { id: "prog-1", name: "Clean Water" },
  }));
  dists_for_refund_mock.mockResolvedValue([graph]);
  process_refund_mock.mockImplementation(async () => {
    don_status = "refunded";
    return { failures: [], loss_msgs: [], has_loss: false, applied: 1 };
  });
  send_alert_mock.mockResolvedValue(undefined);
  enqueue_mock.mockResolvedValue(undefined);
});

describe("stripe charge.dispute.created → ops alert", () => {
  it("tells ops which donation is disputed, for how much and why, and reverses nothing yet", async () => {
    await handle_dispute_created(
      dispute_event("charge.dispute.created", "needs_response")
    );

    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).toHaveBeenCalledOnce();
    const text = `${alerts()[0].title}\n${alerts()[0].body}`;
    expect(text).toContain(DON_ID);
    expect(text).toContain("100.00 USD");
    expect(text).toContain("fraudulent");
    expect(text).toContain("dp_1");
  });
});

describe("stripe charge.dispute.closed → reversal on a loss", () => {
  it("reverses a lost dispute's donation and tells ops what it cost, fee included", async () => {
    await handle_dispute_closed(dispute_event("charge.dispute.closed", "lost"));

    expect(process_refund_mock).toHaveBeenCalledExactlyOnceWith(
      DON_ID,
      [graph],
      {
        form_id: "form-1",
        program_id: "prog-1",
        alert_from: expect.any(String),
      }
    );
    const [notice] = queued();
    expect(queued()).toHaveLength(1);
    const text = `${notice.payload.alert.title}\n${notice.payload.alert.body}`;
    expect(text).toContain(DON_ID);
    expect(text).toContain("100.00 USD");
    expect(text).toMatch(/fee.*15\.00 USD/);
  });

  it("reverses nothing when a lost dispute covers only part of the gift, and tells ops to adjust by hand", async () => {
    await handle_dispute_closed(
      dispute_event("charge.dispute.closed", "lost", 4_000)
    );

    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(don_status).toBe("settled");
    expect(send_alert_mock).toHaveBeenCalledOnce();
    const { title, body } = alerts()[0];
    expect(title).toMatch(/not reversed/i);
    expect(body).toContain(DON_ID);
    expect(body).toContain("40.00 USD of 100.00 USD");
  });

  it("reverses when a lost dispute takes what earlier refunds left, and names those refunds", async () => {
    refunds = [{ id: "re_1", amount: 6_000, status: "succeeded" }];

    await handle_dispute_closed(
      dispute_event("charge.dispute.closed", "lost", 4_000)
    );

    expect(process_refund_mock).toHaveBeenCalledOnce();
    const { body } = queued()[0].payload.alert;
    expect(body).toContain("60.00 USD (re_1, succeeded)");
  });

  it("keeps the donation settled when the dispute is won", async () => {
    await handle_dispute_closed(dispute_event("charge.dispute.closed", "won"));

    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(don_status).toBe("settled");
  });

  it("reverses once when stripe redelivers a lost dispute", async () => {
    const lost = dispute_event("charge.dispute.closed", "lost");
    await handle_dispute_closed(lost);
    await handle_dispute_closed(lost);

    expect(process_refund_mock).toHaveBeenCalledOnce();
    expect(queued()).toHaveLength(1);
  });

  it("says the reversal did not complete when dists fail to reverse", async () => {
    process_refund_mock.mockResolvedValue({
      failures: ["dist dist_1: db timeout"],
      loss_msgs: [],
      has_loss: false,
      applied: 0,
    });

    await handle_dispute_closed(dispute_event("charge.dispute.closed", "lost"));

    const { title, body } = queued()[0].payload.alert;
    expect(title).toMatch(/did not complete/i);
    expect(body).toContain("1 of 1 dists failed to reverse");
  });
});
