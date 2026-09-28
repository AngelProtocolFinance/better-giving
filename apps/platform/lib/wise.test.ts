import { afterEach, describe, expect, test, vi } from "vitest";
import { Wise } from "./wise";

const client = new Wise({ apiToken: "token", base_url: "https://wise.test" });

/** a wise that accepts the request and never answers */
function hang_fetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason)
        );
      })
  );
}

/** node arms `AbortSignal.timeout` on a timer vitest's fake clock can't reach */
function fake_timeout_signals() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(
      () => c.abort(new DOMException("signal timed out", "TimeoutError")),
      ms
    );
    return c.signal;
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("wise client", () => {
  test.each([
    ["v2_account", () => client.v2_account(1)],
    ["balance", () => client.balance(1, 2)],
    ["quote", () => client.quote("2", {} as any)],
    ["transfer", () => client.transfer({} as any)],
    ["fund_transfer", () => client.fund_transfer(1, 2, { type: "BALANCE" })],
  ])("a hung %s call rejects after 30s", async (_, call) => {
    fake_timeout_signals();
    hang_fetch();

    const settled = call().then(
      () => "resolved",
      (e: unknown) => e
    );
    await vi.advanceTimersByTimeAsync(29_999);
    const early = await Promise.race([settled, Promise.resolve("pending")]);
    await vi.advanceTimersByTimeAsync(1);

    expect(early).toBe("pending");
    expect(await settled).toMatchObject({ name: "TimeoutError" });
  });
});
