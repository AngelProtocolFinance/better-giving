import { beforeEach, describe, expect, it, vi } from "vitest";

const intent_retrieve_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const donation_by_sttl_id_mock = vi.hoisted(() => vi.fn());
const dists_for_refund_mock = vi.hoisted(() => vi.fn());
const process_refund_mock = vi.hoisted(() => vi.fn());
const send_alert_mock = vi.hoisted(() => vi.fn());
const report_error_mock = vi.hoisted(() => vi.fn());
const enqueue_mock = vi.hoisted(() => vi.fn());

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

const { handle_charge_refunded } = await import("./charge-refunded");

const { ReversalIncompleteError } = await import(
  "../helpers/reversal-incomplete"
);

const ORDER_ID = "0195c1f0-4c37-7c1a-b8f1-1f1f0a2f9d3e";
const AMOUNT = 10_000;

/** stripe's side of one $100 usd charge; refunds newest first, as stripe lists them */
let refunds: {
  id: string;
  amount: number;
  status: string;
  created: number;
}[] = [];
let don_status = "settled";
let clock = 1_700_000_000;

const charge_now = () => {
  const amount_refunded = refunds
    .filter((r) => r.status !== "failed")
    .reduce((sum, r) => sum + r.amount, 0);
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
  const before = charge_now().amount_refunded;
  clock += 60;
  refunds.unshift({
    id: `re_${refunds.length + 1}`,
    amount,
    status: "succeeded",
    created: clock,
  });
  return {
    id: `evt_${refunds.length}`,
    type: "charge.refunded",
    created: clock,
    data: {
      object: charge_now(),
      // unconfirmed that stripe sends this on charge.refunded; tests that
      // delete it cover the event without it
      previous_attributes: { amount_refunded: before },
    },
  } as any;
};

const alerts = () => send_alert_mock.mock.calls.map(([a]) => a);
/** notices queued for retried delivery rather than sent in the webhook */
const queued = () =>
  enqueue_mock.mock.calls.flat().filter((m) => m.id === "fiat-notice");
const text_of = (a: { title: string; body?: string }) =>
  `${a.title}\n${a.body ?? ""}`;
const new_line = (a: { body?: string }) =>
  a.body?.split("\n").find((l) => l.startsWith("new in this event:"));

const graph = { dist: { id: "dist_1" } };

beforeEach(() => {
  vi.clearAllMocks();
  refunds = [];
  don_status = "settled";
  clock = 1_700_000_000;
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
  donation_by_sttl_id_mock.mockResolvedValue(undefined);
  dists_for_refund_mock.mockResolvedValue([graph]);
  process_refund_mock.mockImplementation(async () => {
    don_status = "refunded";
    return { failures: [], loss_msgs: [], has_loss: false, applied: 1 };
  });
  send_alert_mock.mockResolvedValue(undefined);
  enqueue_mock.mockResolvedValue(undefined);
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

    const redelivered = alerts().at(-1);
    expect(new_line(redelivered)).toBe(
      "new in this event: 5.00 USD (re_1, succeeded)"
    );
    const text = text_of(redelivered);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toContain("10.00 USD (re_2, succeeded)");
    expect(text).toMatch(/total refunded so far: 15\.00 USD of 100\.00 USD/);
  });

  it("marks only the second refund as new on the second partial's notice", async () => {
    await handle_charge_refunded(refund(500));
    await handle_charge_refunded(refund(1_000));

    const second = alerts().at(-1);
    expect(new_line(second)).toBe(
      "new in this event: 10.00 USD (re_2, succeeded)"
    );
    expect(text_of(second)).toContain("5.00 USD (re_1, succeeded)");
    expect(text_of(second)).toMatch(
      /total refunded so far: 15\.00 USD of 100\.00 USD/
    );
  });

  it("marks the same refund as new when stripe redelivers, and names the event", async () => {
    await handle_charge_refunded(refund(500));
    const second = refund(1_000);
    await handle_charge_refunded(second);
    await handle_charge_refunded(second); // stripe redelivers

    const [sent, resent] = alerts().slice(-2);
    expect(new_line(resent)).toBe(new_line(sent));
    expect(new_line(resent)).toBe(
      "new in this event: 10.00 USD (re_2, succeeded)"
    );
    expect(resent.body).toMatch(/\bevent evt_2\b/);
  });

  it("names the latest refund by the event's time when the event carries no previous attributes", async () => {
    await handle_charge_refunded(refund(500));
    const second = refund(1_000);
    delete second.data.previous_attributes;
    refund(2_000); // made after the event, so not in it

    await handle_charge_refunded(second);

    const notice = alerts().at(-1);
    expect(new_line(notice)).toBe(
      "new in this event: 10.00 USD (re_2, succeeded)"
    );
    const text = text_of(notice);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toContain("10.00 USD (re_2, succeeded)");
  });

  it("says it could not tell when two refunds share the latest second and the event carries no previous attributes", async () => {
    await handle_charge_refunded(refund(500));
    const second = refund(1_000);
    delete second.data.previous_attributes;
    refunds[1].created = refunds[0].created; // both made in the same second

    await handle_charge_refunded(second);

    expect(new_line(alerts().at(-1))).toBe(
      "new in this event: could not tell which refund is new"
    );
  });

  it("says it could not tell rather than guess when an earlier refund has since failed", async () => {
    await handle_charge_refunded(refund(500));
    refunds[0].status = "failed"; // the bank refund bounced back

    await handle_charge_refunded(refund(500));

    expect(new_line(alerts().at(-1))).toBe(
      "new in this event: could not tell which refund is new"
    );
  });

  it("reverses every settled dist on a full refund, against the gift's form and program", async () => {
    donation_get_mock.mockImplementation(async () => ({
      id: ORDER_ID,
      status: don_status,
      form_id: "form-1",
      program: { id: "prog-1", name: "Clean Water" },
    }));

    await handle_charge_refunded(refund(AMOUNT));

    expect(process_refund_mock).toHaveBeenCalledOnce();
    expect(process_refund_mock).toHaveBeenCalledWith(ORDER_ID, [graph], {
      form_id: "form-1",
      program_id: "prog-1",
      alert_from: expect.any(String),
    });
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it("ignores a redelivery after a reversal that took a loss", async () => {
    process_refund_mock.mockImplementation(async () => {
      don_status = "refunded_loss";
      return {
        failures: [],
        loss_msgs: ["dist dist_1: payout already sent"],
        has_loss: true,
        applied: 1,
      };
    });
    await handle_charge_refunded(refund(500));
    const completing = refund(9_500);
    await handle_charge_refunded(completing);

    await expect(
      handle_charge_refunded(completing) // stripe redelivers
    ).resolves.toBeUndefined();

    expect(process_refund_mock).toHaveBeenCalledOnce();
    expect(
      alerts().filter((a) => /reversal starting/i.test(a.title))
    ).toHaveLength(1);
    expect(queued()).toHaveLength(1);
  });

  it("reverses once when a later refund completes a partial: says the reversal is starting, then that it completed", async () => {
    await handle_charge_refunded(refund(500));
    expect(don_status).toBe("settled");

    const completing = refund(9_500);
    await handle_charge_refunded(completing);
    await handle_charge_refunded(completing); // stripe redelivers

    expect(don_status).toBe("refunded");
    expect(process_refund_mock).toHaveBeenCalledOnce();
    const [, starting] = alerts();
    expect(alerts()).toHaveLength(2);
    expect(starting.body).toContain(
      "automatic reversal is starting. Don't undo your hand adjustment until the reversal is confirmed."
    );
    // queued, not sent: a lost send is retried by the queue, where a
    // redelivered webhook would stop at the refunded status
    const [msg] = queued();
    expect(queued()).toHaveLength(1);
    // keyed on the completing refund, which every path that reverses it sees
    expect(msg).toMatchObject({
      dedupe: `fiat.notice_${refunds[0]!.id}_0`,
      retries: 3,
    });
    const done = msg.payload.alert;
    expect(done.title).toBe("Reversal Complete: Undo Hand Adjustment");
    expect(done.body).toMatch(/^Reversal complete: undo the hand adjustment/m);
    expect(text_of(done)).toContain(ORDER_ID);
    expect(text_of(done)).toContain("5.00 USD (re_1, succeeded)");
    const [, starting_at] = send_alert_mock.mock.invocationCallOrder;
    const [reversed_at] = process_refund_mock.mock.invocationCallOrder;
    const [done_at] = enqueue_mock.mock.invocationCallOrder;
    expect(starting_at).toBeLessThan(reversed_at);
    expect(done_at).toBeGreaterThan(reversed_at);
  });

  it("fails the delivery when a full refund's reversal leaves dists unreversed", async () => {
    process_refund_mock.mockResolvedValue({
      failures: ["dist dist_1: db timeout"],
      loss_msgs: [],
      has_loss: false,
      applied: 0,
    });

    await expect(handle_charge_refunded(refund(AMOUNT))).rejects.toBeInstanceOf(
      ReversalIncompleteError
    );
    expect(don_status).toBe("settled");
  });

  it("tells ops to keep their hand adjustment, then fails the delivery, when the reversal leaves dists unreversed", async () => {
    await handle_charge_refunded(refund(500));
    dists_for_refund_mock.mockResolvedValue([
      graph,
      { dist: { id: "dist_2" } },
    ]);
    process_refund_mock.mockResolvedValue({
      failures: ["dist dist_2: db timeout"],
      loss_msgs: [],
      has_loss: false,
      applied: 1,
    });

    await expect(handle_charge_refunded(refund(9_500))).rejects.toBeInstanceOf(
      ReversalIncompleteError
    );

    const [, starting] = alerts();
    expect(starting.title).toMatch(/starting/i);
    const outcome = queued()[0].payload.alert;
    expect(outcome.title).toBe(
      "Reversal Did Not Complete: Keep Hand Adjustment"
    );
    expect(outcome.body).toMatch(
      /^Reversal did not complete: keep the hand adjustment/m
    );
    expect(outcome.body).toContain("1 of 2 dists failed to reverse");
    expect(text_of(outcome)).not.toMatch(/reversal complete/i);
  });

  it("a redelivery that completes a reversal left short queues its own undo notice, and the keep notice once", async () => {
    await handle_charge_refunded(refund(500));
    dists_for_refund_mock.mockResolvedValue([
      graph,
      { dist: { id: "dist_2" } },
    ]);
    const short = {
      failures: ["dist dist_2: db timeout"],
      loss_msgs: [],
      has_loss: false,
      applied: 1,
    };
    process_refund_mock
      .mockResolvedValueOnce(short)
      .mockResolvedValueOnce(short);
    const completing = refund(9_500);

    await expect(handle_charge_refunded(completing)).rejects.toThrow();
    await expect(handle_charge_refunded(completing)).rejects.toThrow();
    await expect(handle_charge_refunded(completing)).resolves.toBeUndefined();

    const [keep, keep_again, undo] = queued();
    expect(queued()).toHaveLength(3);
    expect(keep_again.dedupe).toBe(keep.dedupe);
    expect(keep.payload.alert.title).toBe(
      "Reversal Did Not Complete: Keep Hand Adjustment"
    );
    expect(undo.payload.alert.title).toBe(
      "Reversal Complete: Undo Hand Adjustment"
    );
    expect(keep.dedupe).not.toBe(undo.dedupe);
  });

  it("reports rather than fails the delivery when the outcome notice can't be queued, instruction and all", async () => {
    await handle_charge_refunded(refund(500));
    enqueue_mock.mockRejectedValueOnce(new Error("qstash 503"));

    await expect(
      handle_charge_refunded(refund(9_500))
    ).resolves.toBeUndefined();

    expect(don_status).toBe("refunded");
    expect(report_error_mock).toHaveBeenCalledOnce();
    const [err, ctx] = report_error_mock.mock.calls[0]!;
    expect(err).toMatchObject({ message: "qstash 503" });
    // sentry is then the only place the instruction survives
    expect(ctx).toMatchObject({
      donation_id: ORDER_ID,
      title: "Reversal Complete: Undo Hand Adjustment",
    });
    expect(ctx.body).toMatch(/^Reversal complete: undo the hand adjustment/m);
  });

  it("leaves the donation unreversed when the starting notice can't be sent, so the redelivery sends it", async () => {
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

  it("finishes a reversal the admin refund left with a failed dist", async () => {
    // the admin action refunded the charge in full, then a dist failed to reverse
    const by_admin = refund(AMOUNT);
    dists_for_refund_mock.mockResolvedValue([
      { dist: { id: "dist_1", refund_status: "failed" } },
    ]);

    await expect(handle_charge_refunded(by_admin)).resolves.toBeUndefined();

    expect(process_refund_mock).toHaveBeenCalledOnce();
    expect(don_status).toBe("refunded");
  });

  it("fails the delivery while an admin refund's reversal stays incomplete, so stripe redelivers", async () => {
    const by_admin = refund(AMOUNT);
    process_refund_mock.mockResolvedValue({
      failures: ["dist dist_1: db timeout"],
      loss_msgs: [],
      has_loss: false,
      applied: 0,
    });

    await expect(handle_charge_refunded(by_admin)).rejects.toBeInstanceOf(
      ReversalIncompleteError
    );
  });

  it("leaves an admin refund alone once the donation is reversed", async () => {
    const by_admin = refund(AMOUNT);
    don_status = "refunded"; // the admin action reversed it

    await expect(handle_charge_refunded(by_admin)).resolves.toBeUndefined();

    expect(process_refund_mock).not.toHaveBeenCalled();
    expect(alerts()).toEqual([]);
    expect(queued()).toEqual([]);
  });

  it("reverses the rebill a refunded subscription charge settled, not the order it was cloned from", async () => {
    const REBILL_ID = "0195c1f0-4c37-7c1a-b8f1-2f2f0a2f9d3e";
    // subscription invoice intents carry no metadata
    intent_retrieve_mock.mockResolvedValue({ id: "pi_1", metadata: {} });
    donation_by_sttl_id_mock.mockImplementation(async (id: string) =>
      id === "pi_1"
        ? { id: REBILL_ID, status: don_status, form_id: null, program: null }
        : undefined
    );

    await expect(
      handle_charge_refunded(refund(AMOUNT))
    ).resolves.toBeUndefined();

    expect(dists_for_refund_mock).toHaveBeenCalledWith(REBILL_ID);
    expect(process_refund_mock).toHaveBeenCalledWith(
      REBILL_ID,
      [graph],
      expect.anything()
    );
  });
});
