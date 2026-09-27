import { beforeEach, describe, expect, it, vi } from "vitest";

const intent_retrieve_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const dists_for_refund_mock = vi.hoisted(() => vi.fn());
const process_refund_mock = vi.hoisted(() => vi.fn());
const send_alert_mock = vi.hoisted(() => vi.fn());

vi.mock("$/kit/stripe", () => ({
  stripe: {
    paymentIntents: { retrieve: intent_retrieve_mock },
    charges: { retrieve: charge_retrieve_mock },
    refunds: { list: refunds_list_mock },
  },
}));
vi.mock("$/pg/queries/donation", () => ({ donation_get: donation_get_mock }));
vi.mock("$/pg/queries/dist", () => ({
  dists_for_refund: dists_for_refund_mock,
}));
vi.mock("$/refund/process", () => ({ process_refund: process_refund_mock }));
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));

const { handle_charge_refunded } = await import("./charge-refunded");

const ORDER_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";
const AMOUNT = 10_000;

/** stripe's side of one $100 usd charge; refunds newest first, as stripe lists them */
let refunds: { id: string; amount: number; status: string }[] = [];
let don_status = "settled";

const charge_now = () => {
  const amount_refunded = refunds.reduce((sum, r) => sum + r.amount, 0);
  return {
    id: "ch_1",
    payment_intent: "pi_1",
    currency: "usd",
    amount: AMOUNT,
    amount_refunded,
    refunded: amount_refunded === AMOUNT,
  };
};

/** support refunds `amount` from the dashboard; returns the event stripe sends for it */
const refund = (amount: number) => {
  refunds.unshift({
    id: `re_${refunds.length + 1}`,
    amount,
    status: "succeeded",
  });
  return { object: charge_now() } as any;
};

const alerts = () => send_alert_mock.mock.calls.map(([a]) => a);
const text_of = (a: { title: string; body?: string }) =>
  `${a.title}\n${a.body ?? ""}`;

const graph = { dist: { id: "dist_1" } };

beforeEach(() => {
  vi.clearAllMocks();
  refunds = [];
  don_status = "settled";
  intent_retrieve_mock.mockResolvedValue({
    id: "pi_1",
    metadata: { order_id: ORDER_ID },
  });
  charge_retrieve_mock.mockImplementation(async () => charge_now());
  refunds_list_mock.mockImplementation(async () => ({ data: [...refunds] }));
  donation_get_mock.mockImplementation(async () => ({
    id: ORDER_ID,
    status: don_status,
    form_id: null,
    program: null,
  }));
  dists_for_refund_mock.mockResolvedValue([graph]);
  process_refund_mock.mockImplementation(async () => {
    don_status = "refunded";
    return { failures: [], loss_msgs: [], has_loss: false, applied: 1 };
  });
  send_alert_mock.mockResolvedValue(undefined);
});

describe("stripe charge.refunded → donation reversal", () => {
  // resolving is what the route turns into a 200, so stripe stops redelivering
  it("reverses nothing on a partial refund and tells ops once", async () => {
    await expect(handle_charge_refunded(refund(500))).resolves.toBeUndefined();

    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(don_status).toBe("settled");
    expect(send_alert_mock).toHaveBeenCalledOnce();
    const text = text_of(alerts()[0]);
    expect(text).toContain(ORDER_ID);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toMatch(/total refunded so far: 5\.00 USD of 100\.00 USD/);
    expect(text).toMatch(/reverses automatically/);
  });

  it("names every partial when a failed first notice is redelivered after a second partial", async () => {
    const first = refund(500);
    send_alert_mock.mockRejectedValueOnce(new Error("discord 503"));
    await expect(handle_charge_refunded(first)).rejects.toThrow();

    await handle_charge_refunded(refund(1_000));
    await handle_charge_refunded(first); // stripe redelivers

    const text = text_of(alerts().at(-1));
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toContain("10.00 USD (re_2, succeeded)");
    expect(text).toMatch(/total refunded so far: 15\.00 USD of 100\.00 USD/);
  });

  it("reverses every settled dist on a full refund", async () => {
    await handle_charge_refunded(refund(AMOUNT));

    expect(process_refund_mock).toHaveBeenCalledOnce();
    expect(process_refund_mock).toHaveBeenCalledWith(ORDER_ID, [graph], {
      form_id: null,
      program_id: null,
      alert_from: "charge-refunded",
    });
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it("reverses once when a later refund completes a partial, and tells ops to undo their hand adjustment", async () => {
    await handle_charge_refunded(refund(500));
    expect(don_status).toBe("settled");

    const completing = refund(9_500);
    await handle_charge_refunded(completing);
    await handle_charge_refunded(completing); // stripe redelivers

    expect(don_status).toBe("refunded");
    expect(process_refund_mock).toHaveBeenCalledOnce();
    const undo = alerts().filter((a) => /undo/i.test(a.title));
    expect(undo).toHaveLength(1);
    const text = text_of(undo[0]);
    expect(text).toContain(ORDER_ID);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toContain("re_2");
  });

  it("leaves the donation unreversed when the undo notice can't be sent, so the redelivery sends it", async () => {
    await handle_charge_refunded(refund(500));
    send_alert_mock.mockRejectedValue(new Error("discord 503"));

    await expect(handle_charge_refunded(refund(9_500))).rejects.toThrow(
      "discord 503"
    );
    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(don_status).toBe("settled");
  });

  it("judges the charge as it is now, not the event's copy of it", async () => {
    const stale = refund(500);
    refund(9_500);

    await handle_charge_refunded(stale);

    expect(don_status).toBe("refunded");
    expect(
      alerts().some((a) => /partial refund not reversed/i.test(a.title))
    ).toBe(false);
  });

  it("ignores a partial event that arrives after the donation was reversed", async () => {
    const late = refund(500);
    await handle_charge_refunded(refund(9_500));
    vi.clearAllMocks();

    await handle_charge_refunded(late);

    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  // the notice is the only record ops gets, so a lost one must be redelivered
  it("fails the delivery when the partial-refund notice can't be sent", async () => {
    send_alert_mock.mockRejectedValue(new Error("discord 503"));

    await expect(handle_charge_refunded(refund(500))).rejects.toThrow(
      "discord 503"
    );
  });
});
