import { describe, expect, test } from "vitest";
import { net_owed } from "./net-owed";

const owes = (donation_id: string, outstanding_usd: number) => ({
  donation_id,
  outstanding_usd,
});

describe("net_owed", () => {
  test("pays the pending total less what is owed, recovering all of it", () => {
    expect(net_owed(500, [owes("d-1", 93.2)], 50)).toEqual({
      status: "pay",
      gross: 500,
      net: 406.8,
      recovered: [{ donation_id: "d-1", usd: 93.2 }],
      repaid: [],
    });
  });

  test("owing at least the pending total recovers all of it with no transfer, the rest still owed", () => {
    expect(net_owed(80, [owes("d-1", 93.2)], 50)).toEqual({
      status: "recover_only",
      gross: 80,
      recovered: [{ donation_id: "d-1", usd: 80 }],
      repaid: [],
    });
  });

  test("recovers oldest gift first, the last one taken in part to the cent", () => {
    const owed = [owes("d-old", 60.1), owes("d-new", 70)];
    expect(net_owed(90.3, owed, 50)).toMatchObject({
      status: "recover_only",
      recovered: [
        { donation_id: "d-old", usd: 60.1 },
        { donation_id: "d-new", usd: 30.2 },
      ],
    });
  });

  test("a positive net under the minimum claims and recovers nothing, naming what it was judged on", () => {
    const owed = [owes("d-1", 93.2), owes("d-2", -10)];
    expect(net_owed(150, owed, 100)).toEqual({
      status: "under_minimum",
      gross: 150,
      net: 66.8,
      minimum: 100,
      deductions: [
        { donation_id: "d-1", usd: 93.2 },
        { donation_id: "d-2", usd: -10 },
      ],
    });
  });

  test("a gift due back from a credit is paid with the pending total", () => {
    expect(net_owed(500, [owes("d-1", -50)], 50)).toEqual({
      status: "pay",
      gross: 500,
      net: 550,
      recovered: [],
      repaid: [{ donation_id: "d-1", usd: 50 }],
    });
  });

  test("a gift due back covers what is owed before the pending total runs out", () => {
    const owed = [owes("d-1", 93.2), owes("d-2", -10)];
    expect(net_owed(80, owed, 50)).toEqual({
      status: "recover_only",
      gross: 80,
      recovered: [{ donation_id: "d-1", usd: 90 }],
      repaid: [{ donation_id: "d-2", usd: 10 }],
    });
  });

  test("a sub-cent amount owed is recovered to the cent, so the ledger takes what the transfer withholds", () => {
    expect(net_owed(500, [owes("d-1", 93.2051)], 50)).toMatchObject({
      net: 406.8,
      recovered: [{ donation_id: "d-1", usd: 93.2 }],
    });
  });

  test("a due-back under a cent is not paid", () => {
    expect(net_owed(500, [owes("d-1", -0.004)], 50)).toMatchObject({
      net: 500,
      repaid: [],
    });
  });

  test("owing nothing pays the pending total, under the minimum or not", () => {
    expect(net_owed(500, [], 50)).toEqual({
      status: "pay",
      gross: 500,
      net: 500,
      recovered: [],
      repaid: [],
    });
    expect(net_owed(40, [], 50)).toEqual({
      status: "under_minimum",
      gross: 40,
      net: 40,
      minimum: 50,
      deductions: [],
    });
  });

  test("a $0 pending total owing nothing, or under a cent, is under the minimum", () => {
    expect(net_owed(0, [], 50)).toMatchObject({ status: "under_minimum" });
    expect(net_owed(0, [owes("d-1", 0.004)], 50)).toMatchObject({
      status: "under_minimum",
    });
  });
});
