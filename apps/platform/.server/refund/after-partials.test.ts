import { describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({ stage: "test" }));
vi.mock("../kit/queue", () => ({ enqueue: vi.fn() }));
vi.mock("../pg/queries/donation", () => ({ donation_get: vi.fn() }));
vi.mock("#/errors/report", () => ({ report_error: vi.fn() }));

const { earlier_partials } = await import("./after-partials");

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
