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
const load_reversible_mock = vi.hoisted(() => vi.fn());
const dispute_close_mock = vi.hoisted(() => vi.fn());

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
// the reversal and the dispute record are `.server/refund/`'s ground; here
// they are the boundary, and `../dispute.test.ts` runs them for real
vi.mock("$/refund/reverse", () => ({
  reverse_charge: reverse_charge_mock,
  load_reversible: load_reversible_mock,
}));
vi.mock("$/refund/dispute", () => ({}));
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/dispute", () => ({ dispute_close: dispute_close_mock }));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));

const { handle_dispute_closed } = await import("./charge-dispute");

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
    created: 1_793_456_000,
    data: {
      object: {
        id: "dp_1",
        amount,
        currency: "usd",
        charge: "ch_1",
        payment_intent: "pi_1",
        reason: "fraudulent",
        status,
        created: 1_790_000_000,
        evidence_details: { due_by: 1_767_225_600 },
        balance_transactions: [
          { id: "txn_1", amount: -10_000, fee: 1_500, currency: "usd" },
        ],
      },
    },
  }) as any;

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
    amount_captured: 10_000,
    currency: "usd",
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
  load_reversible_mock.mockImplementation(async () =>
    don_status === "settled"
      ? { status: "reversible" }
      : { status: "already_reversed", donation_status: don_status }
  );
  reverse_charge_mock.mockImplementation(async () => {
    don_status = "refunded";
    return {
      status: "reversed",
      dists: 1,
      applied: 1,
      owed_msgs: [],
      has_loss: false,
    };
  });
  send_alert_mock.mockResolvedValue(undefined);
  enqueue_mock.mockResolvedValue(undefined);
});

describe("stripe charge.dispute.closed → reversal on a loss", () => {
  it("reverses a lost dispute's donation and tells ops what it cost, fee included", async () => {
    await handle_dispute_closed(dispute_event("charge.dispute.closed", "lost"));

    expect(reverse_charge_mock).toHaveBeenCalledExactlyOnceWith({
      donation_id: DON_ID,
      rail: "stripe",
      source: "dispute",
      share: { taken: 10_000, of: 10_000 },
      refunds: [],
      dispute_fee_usd: 15,
      source_ref: "dp_1",
      alert_from: "charge-dispute",
      notice: { id: "evt_charge.dispute.closed", lines: expect.any(Array) },
    });
    const text = notice_text();
    expect(text).toContain(DON_ID);
    expect(text).toContain("100.00 USD");
    expect(text).toMatch(/fee.*15\.00 USD/);
  });

  it("hands a lost dispute covering only part of the gift over as that share", async () => {
    reverse_charge_mock.mockResolvedValue({
      status: "partial_owed",
      owed_msgs: [],
    });

    await expect(
      handle_dispute_closed(
        dispute_event("charge.dispute.closed", "lost", 4_000)
      )
    ).resolves.toBeUndefined();

    expect(reverse_charge_mock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "dispute",
        share: { taken: 4_000, of: 10_000 },
        dispute_fee_usd: 15,
      })
    );
    const text = notice_text();
    expect(text).toContain(DON_ID);
    expect(text).toContain("40.00 USD of 100.00 USD");
    expect(text).toMatch(/fee.*15\.00 USD/);
  });

  it("keys a partial loss's notice on the event, so a redelivery collapses into it", async () => {
    reverse_charge_mock.mockResolvedValue({
      status: "partial_owed",
      owed_msgs: [],
    });
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
    refunds = [
      { id: "re_2", amount: 1_000, status: "pending" },
      { id: "re_1", amount: 6_000, status: "succeeded" },
    ];

    await handle_dispute_closed(
      dispute_event("charge.dispute.closed", "lost", 4_000)
    );

    expect(reverse_charge_mock).toHaveBeenCalledOnce();
    const handed = reverse_charge_mock.mock.lastCall![0];
    expect(handed.share).toEqual({ taken: 10_000, of: 10_000 });
    expect(handed.refunds).toEqual([{ id: "re_1", amount: 6_000 }]);
    expect(notice_text()).toContain("60.00 USD (re_1, succeeded)");
  });

  it("acknowledges a lost dispute stripe redelivers after it reversed, asking stripe nothing", async () => {
    const lost = dispute_event("charge.dispute.closed", "lost");
    await handle_dispute_closed(lost);
    charge_retrieve_mock.mockRejectedValue(new Error("stripe unavailable"));

    await expect(handle_dispute_closed(lost)).resolves.toBeUndefined();
    expect(reverse_charge_mock).toHaveBeenCalledOnce();
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
