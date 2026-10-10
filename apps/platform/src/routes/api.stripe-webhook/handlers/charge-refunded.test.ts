import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChargeReversal } from "$/refund/reverse";

const intent_retrieve_mock = vi.hoisted(() => vi.fn());
const charge_retrieve_mock = vi.hoisted(() => vi.fn());
const refunds_list_mock = vi.hoisted(() => vi.fn());
const donation_get_mock = vi.hoisted(() => vi.fn());
const donation_by_sttl_id_mock = vi.hoisted(() => vi.fn());
const reverse_charge_mock = vi.hoisted(() => vi.fn());
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
vi.mock("$/pg/db", () => ({ db: {} }));
vi.mock("$/pg/queries/donation", () => ({
  donation_get: donation_get_mock,
  donation_by_sttl_id: donation_by_sttl_id_mock,
}));
// the reversal is `reverse.test.ts`'s ground; here it is the boundary, and
// what the handler hands it is the handler's whole answer
vi.mock("$/refund/reverse", () => ({ reverse_charge: reverse_charge_mock }));
vi.mock("#/errors/report", () => ({ report_error: report_error_mock }));
vi.mock("$/kit/discord", () => ({
  fiat_monitor: { send_alert: send_alert_mock },
}));
vi.mock("$/kit/queue", () => ({ enqueue: enqueue_mock }));

const { handle_charge_refunded } = await import("./charge-refunded");
const { handle_refund_updated } = await import("./refund-updated");

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

// as stripe returns it: the share is read off the refund list, not a
// refunded total stripe doesn't document for pending or failed refunds
const charge_now = () => ({
  id: "ch_1",
  payment_intent: "pi_1",
  currency: "usd",
  amount: AMOUNT,
  amount_captured: AMOUNT,
});

/** the event's own copy of the charge names its refunded total */
const live_refunded = () =>
  refunds
    .filter((r) => r.status !== "failed" && r.status !== "canceled")
    .reduce((sum, r) => sum + r.amount, 0);

/** support refunds `amount` from the dashboard; returns the event stripe sends
 * for it. a bank refund (ach, acss) starts pending */
const refund = (amount: number, status = "succeeded") => {
  const before = live_refunded();
  clock += 60;
  refunds.unshift({
    id: `re_${refunds.length + 1}`,
    amount,
    status,
    created: clock,
  });
  return {
    id: `evt_${refunds.length}`,
    type: "charge.refunded",
    created: clock,
    data: {
      object: { ...charge_now(), amount_refunded: live_refunded() },
      // unconfirmed that stripe sends this on charge.refunded; tests that
      // delete it cover the event without it
      previous_attributes: { amount_refunded: before },
    },
  } as any;
};

/** the bank settles refund `id` as `status`; returns stripe's refund.updated for it */
const settle = (id: string, status: string) => {
  const r = refunds.find((x) => x.id === id);
  if (!r) throw new Error(`no refund ${id}`);
  const previous = r.status;
  r.status = status;
  clock += 60;
  return {
    id: `evt_${id}_${status}`,
    type: "refund.updated",
    created: clock,
    data: {
      object: { ...r, charge: "ch_1", payment_intent: "pi_1", currency: "usd" },
      previous_attributes: { status: previous },
    },
  } as any;
};

/** notices the handler queues itself, for retried delivery */
const queued = () =>
  enqueue_mock.mock.calls.flat().filter((m) => m.id === "fiat-notice");
const text_of = (a: { title: string; body?: string }) =>
  `${a.title}\n${a.body ?? ""}`;

/** what each reversal was handed, in order */
const reversals = (): ChargeReversal[] =>
  reverse_charge_mock.mock.calls.map(([r]) => r);
const is_held = (r: ChargeReversal) => (r.unsent_refunds?.length ?? 0) > 0;
const is_whole = (r: ChargeReversal) =>
  r.share !== null && r.share.taken >= r.share.of;
/** handed over with no refund unsent: a share of the charge, or the whole */
const partials = () => reversals().filter((r) => !is_held(r) && !is_whole(r));
const fulls = () => reversals().filter((r) => !is_held(r) && is_whole(r));
const notice_text = (r: ChargeReversal) => r.notice.lines.join("\n");
const new_line = (r: ChargeReversal) =>
  r.notice.lines.find((l) => l.startsWith("new in this event:"));

const reversed = {
  status: "reversed",
  dists: 1,
  applied: 1,
  owed_msgs: [],
  has_loss: false,
};
const incomplete = {
  status: "failed",
  reason: "incomplete",
  dists: 1,
  applied: 0,
  failures: ["dist dist_1: db timeout"],
};

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
  donation_get_mock.mockImplementation(async (id: string) => ({
    id,
    status: don_status,
    via: "stripe:card",
    settlement: { id: "pi_1", fee: 320, currency: "USD" },
    form_id: null,
    program: null,
  }));
  donation_by_sttl_id_mock.mockResolvedValue(undefined);
  // the entry's answers to what it is handed
  reverse_charge_mock.mockImplementation(async (r: ChargeReversal) => {
    if (is_held(r)) return { status: "held" };
    if (!is_whole(r)) return { status: "partial_owed", owed_msgs: [] };
    don_status = "refunded";
    return reversed;
  });
  send_alert_mock.mockResolvedValue(undefined);
  enqueue_mock.mockResolvedValue(undefined);
});

describe("stripe charge.refunded → donation reversal", () => {
  // resolving is what the route turns into a 200, so stripe stops redelivering
  it("hands a partial refund over as its share, with the charge's refunds for ops", async () => {
    await expect(handle_charge_refunded(refund(500))).resolves.toBeUndefined();

    expect(fulls()).toEqual([]);
    expect(don_status).toBe("settled");
    const [partial, ...rest] = partials();
    expect(rest).toEqual([]);
    expect(partial).toMatchObject({
      donation_id: ORDER_ID,
      rail: "stripe",
      source: "refund",
      share: { taken: 500, of: AMOUNT },
      unsent_refunds: [],
      source_ref: "re_1",
      alert_from: "charge-refunded",
      notice: { id: "evt_1" },
    });
    const text = notice_text(partial!);
    expect(text).toContain(ORDER_ID);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toMatch(/total refunded so far: 5\.00 USD of 100\.00 USD/);
  });

  // a refund credited back as failed since the list was read isn't owed again
  it("hands over the refunds its share counts, a failed one left out", async () => {
    refund(500);
    refunds[0].status = "failed";
    refund(1_000);

    await handle_charge_refunded(refund(2_000, "pending"));

    expect(reversals().map((r) => r.refunds)).toEqual([
      [
        { id: "re_3", amount: 2_000 },
        { id: "re_2", amount: 1_000 },
      ],
    ]);
  });

  it("names every partial when a failed first notice is redelivered after a second partial", async () => {
    const first = refund(500);
    reverse_charge_mock.mockRejectedValueOnce(new Error("qstash 503"));
    await expect(handle_charge_refunded(first)).rejects.toThrow();

    await handle_charge_refunded(refund(1_000));
    await handle_charge_refunded(first); // stripe redelivers

    const redelivered = partials().at(-1)!;
    expect(new_line(redelivered)).toBe(
      "new in this event: 5.00 USD (re_1, succeeded)"
    );
    const text = notice_text(redelivered);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toContain("10.00 USD (re_2, succeeded)");
    expect(text).toMatch(/total refunded so far: 15\.00 USD of 100\.00 USD/);
  });

  it("marks only the second refund as new on the second partial's notice", async () => {
    await handle_charge_refunded(refund(500));
    await handle_charge_refunded(refund(1_000));

    const second = partials().at(-1)!;
    expect(new_line(second)).toBe(
      "new in this event: 10.00 USD (re_2, succeeded)"
    );
    expect(notice_text(second)).toContain("5.00 USD (re_1, succeeded)");
    expect(notice_text(second)).toMatch(
      /total refunded so far: 15\.00 USD of 100\.00 USD/
    );
  });

  it("marks the same refund as new when stripe redelivers, and names the event", async () => {
    await handle_charge_refunded(refund(500));
    const second = refund(1_000);
    await handle_charge_refunded(second);
    await handle_charge_refunded(second); // stripe redelivers

    const [sent, resent] = partials().slice(-2);
    // keyed on the event, so the reversal's notice collapses the redelivery into one
    expect(sent!.notice.id).toBe("evt_2");
    expect(resent!.notice.id).toBe(sent!.notice.id);
    expect(new_line(resent!)).toBe(new_line(sent!));
    expect(new_line(resent!)).toBe(
      "new in this event: 10.00 USD (re_2, succeeded)"
    );
    expect(notice_text(resent!)).toMatch(/\bevent evt_2\b/);
  });

  it("names the latest refund by the event's time when the event carries no previous attributes", async () => {
    await handle_charge_refunded(refund(500));
    const second = refund(1_000);
    delete second.data.previous_attributes;
    refund(2_000); // made after the event, so not in it

    await handle_charge_refunded(second);

    const notice = partials().at(-1)!;
    expect(new_line(notice)).toBe(
      "new in this event: 10.00 USD (re_2, succeeded)"
    );
    const text = notice_text(notice);
    expect(text).toContain("5.00 USD (re_1, succeeded)");
    expect(text).toContain("10.00 USD (re_2, succeeded)");
  });

  it("says it could not tell when two refunds share the latest second and the event carries no previous attributes", async () => {
    await handle_charge_refunded(refund(500));
    const second = refund(1_000);
    delete second.data.previous_attributes;
    refunds[1].created = refunds[0].created; // both made in the same second

    await handle_charge_refunded(second);

    expect(new_line(partials().at(-1)!)).toBe(
      "new in this event: could not tell which refund is new"
    );
  });

  it("says it could not tell rather than guess when an earlier refund has since failed", async () => {
    await handle_charge_refunded(refund(500));
    refunds[0].status = "failed"; // the bank refund bounced back

    await handle_charge_refunded(refund(500));

    expect(new_line(partials().at(-1)!)).toBe(
      "new in this event: could not tell which refund is new"
    );
  });

  // the intent names the recurring gift the entry ends
  it("hands a full refund over as the whole charge, with its intent and the refund that completed it", async () => {
    await handle_charge_refunded(refund(AMOUNT));

    expect(reverse_charge_mock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        donation_id: ORDER_ID,
        share: { taken: AMOUNT, of: AMOUNT },
        unsent_refunds: [],
        intent_id: "pi_1",
        source_ref: "re_1",
      })
    );
    expect(don_status).toBe("refunded");
    expect(send_alert_mock).not.toHaveBeenCalled();
  });

  it("hands the bank refund that completes the charge over as unsent while it is pending", async () => {
    await expect(
      handle_charge_refunded(refund(AMOUNT, "pending"))
    ).resolves.toBeUndefined();

    expect(reversals().map((r) => r.unsent_refunds)).toEqual([["re_1"]]);
    expect(don_status).toBe("settled");
  });

  it("tells ops once that the reversal waits on the pending refund succeeding", async () => {
    const created = refund(AMOUNT, "pending");

    await handle_charge_refunded(created);
    await handle_charge_refunded(created); // stripe redelivers

    const held = queued().filter((m) => m.payload.id === "re_1_held");
    expect(held).toHaveLength(2);
    expect(new Set(held.map((m) => m.dedupe))).toEqual(
      new Set(["fiat.notice_re_1_held"])
    );
    const text = text_of(held[0].payload.alert);
    expect(text).toContain(ORDER_ID);
    expect(text).toContain("100.00 USD (re_1, pending)");
    expect(text).toMatch(/refund\.updated/);
  });

  it("holds the reversal while an earlier bank refund is pending, though the one completing the charge succeeded", async () => {
    await handle_charge_refunded(refund(9_500, "pending"));
    const completing = refund(500);

    await handle_charge_refunded(completing);
    await handle_charge_refunded(completing); // stripe redelivers

    expect(fulls()).toEqual([]);
    expect(don_status).toBe("settled");
    const held = queued().filter((m) => m.payload.id === "re_2_held");
    expect(new Set(held.map((m) => m.dedupe))).toEqual(
      new Set(["fiat.notice_re_2_held"])
    );
    expect(text_of(held[0].payload.alert)).toContain(
      "waiting on: 95.00 USD (re_1, pending)"
    );
  });

  it("fails the delivery when the held-reversal notice can't be queued", async () => {
    enqueue_mock.mockRejectedValue(new Error("qstash 503"));

    await expect(
      handle_charge_refunded(refund(AMOUNT, "pending"))
    ).rejects.toThrow("qstash 503");
  });

  it("ignores a redelivery after a reversal that took a loss", async () => {
    reverse_charge_mock.mockImplementation(async (r: ChargeReversal) => {
      if (!is_whole(r)) return { status: "partial_owed", owed_msgs: [] };
      don_status = "refunded_loss";
      return { ...reversed, has_loss: true };
    });
    await handle_charge_refunded(refund(500));
    const completing = refund(9_500);
    await handle_charge_refunded(completing);

    await expect(
      handle_charge_refunded(completing) // stripe redelivers
    ).resolves.toBeUndefined();

    expect(fulls()).toHaveLength(1);
  });

  it("reverses once when a later refund completes a partial, sourced to the refund that completed it", async () => {
    await handle_charge_refunded(refund(500));
    expect(don_status).toBe("settled");

    const completing = refund(9_500);
    await handle_charge_refunded(completing);
    await handle_charge_refunded(completing); // stripe redelivers

    expect(don_status).toBe("refunded");
    expect(partials()).toHaveLength(1);
    const [full, ...rest] = fulls();
    expect(rest).toEqual([]);
    expect(full!.source_ref).toBe("re_2");
  });

  it("hands over only what live refunds took back, sourced to the live one, when a full refund replaces one that failed", async () => {
    refund(AMOUNT);
    refunds[0].status = "failed"; // the card was closed

    await handle_charge_refunded(refund(AMOUNT));

    expect(fulls()).toEqual([
      expect.objectContaining({
        share: { taken: AMOUNT, of: AMOUNT },
        source_ref: "re_2",
      }),
    ]);
  });

  it("does nothing for a refund event once every refund on the charge failed", async () => {
    const bounced = refund(500);
    refunds[0].status = "failed";

    await expect(handle_charge_refunded(bounced)).resolves.toBeUndefined();

    expect(reverse_charge_mock).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  it("fails the delivery when a full refund's reversal leaves dists unreversed", async () => {
    reverse_charge_mock.mockResolvedValue(incomplete);

    await expect(handle_charge_refunded(refund(AMOUNT))).rejects.toBeInstanceOf(
      ReversalIncompleteError
    );
    expect(don_status).toBe("settled");
  });

  it("fails the delivery with what failed when the reversal after a partial leaves dists unreversed", async () => {
    await handle_charge_refunded(refund(500));
    reverse_charge_mock.mockResolvedValue({
      ...incomplete,
      dists: 2,
      applied: 1,
      failures: ["dist dist_2: db timeout"],
    });

    await expect(handle_charge_refunded(refund(9_500))).rejects.toThrow(
      `1 of 2 dists failed to reverse: ${ORDER_ID}`
    );
  });

  it("a redelivery that completes a reversal left short hands over the same completing refund each time", async () => {
    await handle_charge_refunded(refund(500));
    reverse_charge_mock
      .mockResolvedValueOnce(incomplete)
      .mockResolvedValueOnce(incomplete);
    const completing = refund(9_500);

    await expect(handle_charge_refunded(completing)).rejects.toThrow();
    await expect(handle_charge_refunded(completing)).rejects.toThrow();
    await expect(handle_charge_refunded(completing)).resolves.toBeUndefined();

    expect(fulls().map((r) => r.source_ref)).toEqual(["re_2", "re_2", "re_2"]);
  });

  it("leaves the donation unreversed when the reversal can't queue its starting notice, so the redelivery retries it", async () => {
    await handle_charge_refunded(refund(500));
    reverse_charge_mock.mockRejectedValueOnce(new Error("qstash 503"));

    await expect(handle_charge_refunded(refund(9_500))).rejects.toThrow(
      "qstash 503"
    );
    expect(don_status).toBe("settled");
  });

  it("judges the charge as it is now, not the event's copy of it", async () => {
    const stale = refund(500);
    refund(9_500);

    await handle_charge_refunded(stale);

    expect(don_status).toBe("refunded");
    expect(partials()).toEqual([]);
  });

  it("ignores a partial event that arrives after the donation was reversed", async () => {
    const late = refund(500);
    await handle_charge_refunded(refund(9_500));
    vi.clearAllMocks();

    await handle_charge_refunded(late);

    expect(reverse_charge_mock).not.toHaveBeenCalled();
    expect(queued()).toEqual([]);
  });

  // the notice is the only record ops gets, so a lost one must be redelivered
  it("fails the delivery when the partial-refund notice can't be queued", async () => {
    reverse_charge_mock.mockRejectedValueOnce(new Error("qstash 503"));

    await expect(handle_charge_refunded(refund(500))).rejects.toThrow(
      "qstash 503"
    );
  });

  // the admin action refunded the charge in full, then a dist failed to reverse
  it("finishes a reversal the admin refund left settled", async () => {
    const by_admin = refund(AMOUNT);

    await expect(handle_charge_refunded(by_admin)).resolves.toBeUndefined();

    expect(reverse_charge_mock).toHaveBeenCalledOnce();
    expect(don_status).toBe("refunded");
  });

  it("fails the delivery while an admin refund's reversal stays incomplete, so stripe redelivers", async () => {
    const by_admin = refund(AMOUNT);
    reverse_charge_mock.mockResolvedValue(incomplete);

    await expect(handle_charge_refunded(by_admin)).rejects.toBeInstanceOf(
      ReversalIncompleteError
    );
  });

  it("hands two runs reversing the same refund at once the same completing refund", async () => {
    await handle_charge_refunded(refund(500));
    const completing = refund(9_500);
    // the second run starts before the first flips the donation
    let release!: () => void;
    const both_started = new Promise<void>((r) => {
      release = r;
    });
    let started = 0;
    reverse_charge_mock.mockImplementation(async () => {
      if (++started === 2) release();
      await both_started;
      don_status = "refunded";
      return reversed;
    });

    await Promise.all([
      handle_charge_refunded(completing),
      handle_charge_refunded(completing),
    ]);

    expect(fulls().map((r) => r.source_ref)).toEqual(["re_2", "re_2"]);
    expect(partials()).toHaveLength(1);
  });

  it("leaves an admin refund alone once the donation is reversed", async () => {
    const by_admin = refund(AMOUNT);
    don_status = "refunded"; // the admin action reversed it

    await expect(handle_charge_refunded(by_admin)).resolves.toBeUndefined();

    expect(reverse_charge_mock).not.toHaveBeenCalled();
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

    expect(reverse_charge_mock).toHaveBeenCalledWith(
      expect.objectContaining({ donation_id: REBILL_ID })
    );
  });
});

describe("stripe refund.updated → donation reversal", () => {
  it("reverses the donation once the pending bank refund that completed the charge succeeds", async () => {
    await handle_charge_refunded(refund(AMOUNT, "pending"));

    await expect(
      handle_refund_updated(settle("re_1", "succeeded"))
    ).resolves.toBeUndefined();

    expect(don_status).toBe("refunded");
    expect(fulls()).toEqual([
      expect.objectContaining({
        donation_id: ORDER_ID,
        unsent_refunds: [],
        source_ref: "re_1",
        alert_from: "refund-updated",
      }),
    ]);
  });

  it("reverses once when charge.refunded already reversed a card refund and stripe redelivers its refund.updated", async () => {
    await handle_charge_refunded(refund(AMOUNT));
    const updated = settle("re_1", "succeeded");

    await handle_refund_updated(updated);
    await handle_refund_updated(updated); // stripe redelivers

    expect(fulls()).toHaveLength(1);
    expect(don_status).toBe("refunded");
  });

  it("reverses once when the refund.updated for a pending refund lands before its charge.refunded", async () => {
    const created = refund(AMOUNT, "pending");
    await handle_refund_updated(settle("re_1", "succeeded"));

    await handle_charge_refunded(created);

    expect(fulls()).toHaveLength(1);
    expect(don_status).toBe("refunded");
  });

  it.each(["failed", "canceled"])(
    "reverses nothing when the pending bank refund is %s",
    async (status) => {
      await handle_charge_refunded(refund(AMOUNT, "pending"));

      await expect(
        handle_refund_updated(settle("re_1", status))
      ).resolves.toBeUndefined();

      expect(reversals().filter((r) => !is_held(r))).toEqual([]);
      expect(don_status).toBe("settled");
    }
  );

  it("hands a partial bank refund over as its share once it succeeds", async () => {
    await handle_charge_refunded(refund(500, "pending"));

    await handle_refund_updated(settle("re_1", "succeeded"));

    expect(partials()).toEqual([
      expect.objectContaining({
        share: { taken: 500, of: AMOUNT },
        unsent_refunds: [],
        source_ref: "re_1",
        notice: expect.objectContaining({ id: "evt_re_1_succeeded" }),
      }),
    ]);
  });

  it("waits for the completing refund when an earlier pending partial succeeds first", async () => {
    await handle_charge_refunded(refund(500, "pending"));
    await handle_charge_refunded(refund(9_500, "pending"));

    await handle_refund_updated(settle("re_1", "succeeded"));
    expect(fulls()).toEqual([]);

    await handle_refund_updated(settle("re_2", "succeeded"));
    expect(fulls()).toHaveLength(1);
    expect(don_status).toBe("refunded");
  });

  it("reverses once when the pending earlier refund succeeds after the completing one", async () => {
    await handle_charge_refunded(refund(9_500, "pending"));
    await handle_charge_refunded(refund(500));
    const updated = settle("re_1", "succeeded");

    await handle_refund_updated(updated);
    await handle_refund_updated(updated); // stripe redelivers

    expect(fulls()).toHaveLength(1);
    expect(don_status).toBe("refunded");
  });
});
