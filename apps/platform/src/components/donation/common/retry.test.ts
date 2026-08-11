import { describe, expect, test, vi } from "vitest";
import { retry_once } from "./retry";

describe("retry_once", () => {
  test("a first attempt that works is the only attempt", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(retry_once(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  test("a transient failure resolves on the second attempt", async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("dropped"))
      .mockResolvedValueOnce("ok");

    await expect(retry_once(fn, 0)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("a blocked origin still fails, carrying the second error", async () => {
    // the caller degrades on this, so it has to be the real reason and not the
    // swallowed first one
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"));

    await expect(retry_once(fn, 0)).rejects.toThrow("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("gives up after one retry — never a loop", async () => {
    const fn = vi.fn(async () => {
      throw new Error("blocked");
    });
    await expect(retry_once(fn, 0)).rejects.toThrow("blocked");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("waits before re-attempting", async () => {
    // an immediate retry rides the same dropped connection; the pause is the
    // point of the delay argument
    let first: number | null = null;
    let second: number | null = null;
    const fn = vi.fn(async () => {
      if (first === null) {
        first = performance.now();
        throw new Error("dropped");
      }
      second = performance.now();
      return "ok";
    });

    await retry_once(fn, 50);
    expect(second! - first!).toBeGreaterThanOrEqual(40);
  });
});
