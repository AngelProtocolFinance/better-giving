import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.hoisted(() => vi.fn());
const donation_get = vi.hoisted(() => vi.fn());
const report_error = vi.hoisted(() => vi.fn());
vi.mock("../env", () => ({ stage: "test" }));
vi.mock("../kit/queue", () => ({ enqueue }));
vi.mock("../pg/queries/donation", () => ({ donation_get }));
vi.mock("#/errors/report", () => ({ report_error }));

const { earlier_partials, reverse_after_partials } = await import(
  "./after-partials"
);

const CHARGE = 10_000;
const T = 1_700_000_000;

/** a stripe refund; `at` is seconds after T */
const re = (id: string, amount: number, status: string, at: number) =>
  ({ id, amount, status, created: T + at }) as any;

/** newest first, as stripe lists them */
const ids = (refunds: any[], charge = CHARGE) =>
  earlier_partials(refunds, refunds[0], charge).map((r) => r.id);

describe("earlier_partials", () => {
  it("drops a failed full attempt made in the same second as its replacement", () => {
    const refunds = [
      re("re_full", CHARGE, "succeeded", 0),
      re("re_failed", CHARGE, "failed", 0),
    ];
    expect(ids(refunds)).toEqual([]);
  });

  it("drops two failed full attempts before the one that went through", () => {
    const refunds = [
      re("re_3", CHARGE, "succeeded", 120),
      re("re_2", CHARGE, "canceled", 60),
      re("re_1", CHARGE, "failed", 0),
    ];
    expect(ids(refunds)).toEqual([]);
  });

  it("keeps a real partial and drops the failed full attempt after it", () => {
    const refunds = [
      re("re_3", 9_500, "succeeded", 120),
      re("re_2", 9_500, "failed", 60),
      re("re_1", 500, "succeeded", 0),
    ];
    expect(ids(refunds)).toEqual(["re_1"]);
  });

  it("keeps a failed partial, whose notice ops may have acted on", () => {
    const refunds = [
      re("re_2", CHARGE, "succeeded", 60),
      re("re_1", 500, "failed", 0),
    ];
    expect(ids(refunds)).toEqual(["re_1"]);
  });

  it("keeps every refund while the live ones don't add up to the charge", () => {
    const refunds = [
      re("re_2", 9_500, "succeeded", 60),
      re("re_1", CHARGE, "failed", 0),
    ];
    expect(ids(refunds)).toEqual(["re_1"]);
  });
});

describe("reverse_after_partials", () => {
  const full_refund = {
    donation_id: "don-1",
    seen_at: "charge ch_1, event evt_1",
    currency: "usd",
    completing: re("re_2", 9_500, "succeeded", 60),
    earlier: [re("re_1", 500, "succeeded", 0)],
    alert_from: "charge-refunded",
    dist_count: 2,
  };
  const result = (failures: string[]) => ({
    failures,
    owed_msgs: [],
    has_loss: false,
    applied: 2 - failures.length,
  });
  const notices = () => enqueue.mock.calls.map(([m]) => m.payload);

  beforeEach(() => {
    vi.clearAllMocks();
    enqueue.mockResolvedValue(undefined);
    donation_get.mockResolvedValue({ status: "refunded" });
  });

  it("queues the start before reversing and the undo after, naming the refunds", async () => {
    const reverse = vi.fn(async () => result([]));

    await reverse_after_partials(full_refund, reverse);

    const [start, undo] = notices();
    expect(start.id).toBe("re_2_start");
    expect(start.alert.body).toContain(
      "automatic reversal is starting. Don't undo your hand adjustment until the reversal is confirmed."
    );
    expect(undo.id).toBe("re_2_undo");
    expect(undo.alert.body).toMatch(
      /^Reversal complete: undo the hand adjustment/m
    );
    expect(undo.alert.body).toContain("don-1");
    expect(undo.alert.body).toContain("5.00 USD (re_1, succeeded)");
    const [start_at, undo_at] = enqueue.mock.invocationCallOrder;
    const [reversed_at] = reverse.mock.invocationCallOrder;
    expect(start_at).toBeLessThan(reversed_at!);
    expect(undo_at).toBeGreaterThan(reversed_at!);
  });

  it("says undo, not keep, when a dist this run failed was reversed by another run", async () => {
    await reverse_after_partials(full_refund, async () =>
      result(["dist dist_2: connection terminated"])
    );

    const [, outcome] = notices();
    expect(outcome.id).toBe("re_2_undo");
    expect(outcome.alert.title).toBe("Reversal Complete: Undo Hand Adjustment");
  });

  it("still queues the outcome when the donation can't be re-read, from this run's answer", async () => {
    donation_get.mockRejectedValue(new Error("connection terminated"));

    await reverse_after_partials(full_refund, async () => result([]));

    const [, outcome] = notices();
    expect(outcome.alert.title).toBe("Reversal Complete: Undo Hand Adjustment");
    expect(report_error).toHaveBeenCalledWith(
      expect.objectContaining({ message: "connection terminated" }),
      expect.objectContaining({ donation_id: "don-1" })
    );
  });
});
