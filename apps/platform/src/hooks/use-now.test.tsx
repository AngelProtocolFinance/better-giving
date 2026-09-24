import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { use_now } from "./use-now";

const LOADER_NOW = "2027-09-23T12:00:00.000Z";
const loader_ms = Date.parse(LOADER_NOW);
const MINUTE_MS = 60_000;

afterEach(() => {
  vi.useRealTimers();
});

function Now() {
  return use_now(LOADER_NOW).toISOString();
}

describe("use_now", () => {
  test("renders the loader's time on the server, whatever the clock reads", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: loader_ms + MINUTE_MS });
    expect(renderToString(<Now />)).toBe(LOADER_NOW);
  });

  test("never runs behind the loader's time once mounted", async () => {
    vi.useFakeTimers({
      toFake: ["Date", "setTimeout", "clearTimeout"],
      now: loader_ms - MINUTE_MS,
    });
    const until = new Date(loader_ms + 10);
    const { result, act } = await renderHook(() => use_now(LOADER_NOW, until));
    expect(result.current.getTime()).toBe(loader_ms);
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(result.current.getTime()).toBe(until.getTime());
  });
});
