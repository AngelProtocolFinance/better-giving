import { beforeEach, describe, expect, it, vi } from "vitest";

const intent_retrieve_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const donation_by_sttl_id_mock = vi.hoisted(() => vi.fn());
const reverse_charge_mock = vi.hoisted(() => vi.fn());
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
// the reversal is `reverse.test.ts`'s ground; here it is the boundary
vi.mock("$/refund/reverse", () => ({ reverse_charge: reverse_charge_mock }));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));

const { handle_dispute_created, handle_dispute_closed } = await import(
  "./charge-dispute"
);

const { ReversalIncompleteError } = await import(
  "../helpers/reversal-incomplete"
);

const DON_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";
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

const queued = () =>
  enqueue_mock.mock.calls.flat().filter((m) => m.id === "fiat-notice");

/** the ops notice lines the latest reversal was handed */
const notice_text = () =>
  reverse_charge_mock.mock.lastCall![0].notice.lines.join("\n");

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
  const settled = async () => ({
    id: DON_ID,
    status: don_status,
    via: "stripe:card",
    settlement: { id: "pi_1", fee: 320, currency: "USD" },
    form_id: "form-1",
    program: { id: "prog-1", name: "Clean Water" },
  });
  donation_by_sttl_id_mock.mockImplementation(settled);
  donation_get_mock.mockImplementation(settled);
  reverse_charge_mock.mockImplementation(async () => {
    don_status = "refunded";
    return {
      status: "reversed",
      dists: 1,
      applied: 1,
      owed_msgs: [],
      loss_msgs: [],
      has_loss: false,
    };
  });
  send_alert_mock.mockResolvedValue(undefined);
  enqueue_mock.mockResolvedValue(undefined);
});

describe("stripe charge.dispute.created → ops alert", () => {
  it("tells ops which donation is disputed, for how much and why, and reverses nothing yet", async () => {
    await handle_dispute_created(
      dispute_event("charge.dispute.created", "needs_response")
    );

    expect(reverse_charge_mock).not.toHaveBeenCalled();
    expect(queued()).toHaveLength(1);
    const { alert } = queued()[0].payload;
    const text = `${alert.title}\n${alert.body}`;
    expect(text).toContain(DON_ID);
    expect(text).toContain("100.00 USD");
    expect(text).toContain("fraudulent");
    expect(text).toContain("dp_1");
  });

  it("keys the alert on the event, so a redelivery collapses into it", async () => {
    const opened = dispute_event("charge.dispute.created", "needs_response");
    await handle_dispute_created(opened);
    await handle_dispute_created(opened);

    const [first, again] = queued();
    expect(first.dedupe).toBe(`fiat.notice_${opened.id}`);
    expect(again.dedupe).toBe(first.dedupe);
  });
});

describe("stripe charge.dispute.closed → reversal on a loss", () => {
  it("reverses a lost dispute's donation and tells ops what it cost, fee included", async () => {
    await handle_dispute_closed(dispute_event("charge.dispute.closed", "lost"));

    expect(reverse_charge_mock).toHaveBeenCalledExactlyOnceWith({
      donation_id: DON_ID,
      rail: "stripe",
      source: "dispute",
      dispute_fee: { amount: 1_500, currency: "usd" },
      alert_from: "charge-dispute",
      notice: { id: "evt_charge.dispute.closed", lines: expect.any(Array) },
    });
    const text = notice_text();
    expect(text).toContain(DON_ID);
    expect(text).toContain("100.00 USD");
    expect(text).toMatch(/fee.*15\.00 USD/);
  });

  it("hands a lost dispute covering only part of the gift over as that share, for ops to adjust by hand", async () => {
    reverse_charge_mock.mockResolvedValue({ status: "partial_not_acted" });

    await expect(
      handle_dispute_closed(
        dispute_event("charge.dispute.closed", "lost", 4_000)
      )
    ).resolves.toBeUndefined();

    expect(reverse_charge_mock).toHaveBeenCalledWith(
      expect.objectContaining({ source: "dispute", amount: 4_000 })
    );
    const text = notice_text();
    expect(text).toContain(DON_ID);
    expect(text).toContain("40.00 USD of 100.00 USD");
    expect(text).toMatch(/fee.*15\.00 USD/);
  });

  it("keys a partial loss's notice on the event, so a redelivery collapses into it", async () => {
    reverse_charge_mock.mockResolvedValue({ status: "partial_not_acted" });
    const partial = dispute_event("charge.dispute.closed", "lost", 4_000);
    await handle_dispute_closed(partial);
    await handle_dispute_closed(partial);

    const [first, again] = reverse_charge_mock.mock.calls.map(
      ([r]) => r.notice.id
    );
    expect(first).toBe(partial.id);
    expect(again).toBe(first);
  });

  it("reverses when a lost dispute takes what earlier refunds left, and names those refunds", async () => {
    refunds = [{ id: "re_1", amount: 6_000, status: "succeeded" }];

    await handle_dispute_closed(
      dispute_event("charge.dispute.closed", "lost", 4_000)
    );

    expect(reverse_charge_mock).toHaveBeenCalledOnce();
    expect(reverse_charge_mock.mock.lastCall![0].amount).toBeUndefined();
    expect(notice_text()).toContain("60.00 USD (re_1, succeeded)");
  });

  it("keeps the donation settled when the dispute is won", async () => {
    await handle_dispute_closed(dispute_event("charge.dispute.closed", "won"));

    expect(reverse_charge_mock).not.toHaveBeenCalled();
    expect(don_status).toBe("settled");
  });

  it("acknowledges a lost dispute stripe redelivers after it reversed", async () => {
    const lost = dispute_event("charge.dispute.closed", "lost");
    await handle_dispute_closed(lost);
    reverse_charge_mock.mockResolvedValue({
      status: "already_reversed",
      donation_status: "refunded",
    });

    await expect(handle_dispute_closed(lost)).resolves.toBeUndefined();
  });

  const failing = {
    status: "failed",
    reason: "incomplete",
    dists: 1,
    applied: 0,
    failures: ["dist dist_1: db timeout"],
  };

  it("fails the delivery when dists fail to reverse", async () => {
    reverse_charge_mock.mockResolvedValue(failing);

    await expect(
      handle_dispute_closed(dispute_event("charge.dispute.closed", "lost"))
    ).rejects.toBeInstanceOf(ReversalIncompleteError);
  });

  it("completes a failed reversal on redelivery, keyed on the same event", async () => {
    reverse_charge_mock
      .mockResolvedValueOnce(failing)
      .mockResolvedValueOnce(failing);
    const lost = dispute_event("charge.dispute.closed", "lost");

    await expect(handle_dispute_closed(lost)).rejects.toThrow();
    await expect(handle_dispute_closed(lost)).rejects.toThrow();
    await expect(handle_dispute_closed(lost)).resolves.toBeUndefined();

    expect(don_status).toBe("refunded");
    const ids = reverse_charge_mock.mock.calls.map(([r]) => r.notice.id);
    expect(ids).toEqual([lost.id, lost.id, lost.id]);
  });
});
