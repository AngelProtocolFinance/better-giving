import { describe, expect, test, vi } from "vitest";

const quote = vi.hoisted(() => ({ pc: 0 as unknown }));
vi.mock("$/kit/finnhub", () => ({
  finnhub: async () => Response.json(quote),
}));

import { loader } from "./api.tickers.$symbol.estimate";

const estimate = (symbol = "ZZZZ") =>
  loader({ params: { symbol } } as any) as Promise<Response>;

describe("api.tickers.$symbol.estimate loader", () => {
  test.each([0, -3])("answers 404 when the unit price is %s", async (pc) => {
    quote.pc = pc;
    const res = await estimate();

    expect(res.status).toBe(404);
  });

  test("answers 404 naming the caller's symbol in the body, cached like a price", async () => {
    quote.pc = 0;
    const res = await estimate("ZZ\nZZ");

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=30, stale-while-revalidate=60"
    );
    await expect(res.text()).resolves.toContain("ZZ\nZZ");
  });

  test("answers the minimum units for a priced ticker", async () => {
    quote.pc = 25;
    const res = await estimate();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ min: 2, usdpu: 25 });
  });
});
