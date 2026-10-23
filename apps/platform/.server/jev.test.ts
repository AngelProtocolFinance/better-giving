import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  ai_gateway: { api_key: "test-key" as string | undefined },
}));
vi.mock("./env", () => env);
vi.mock("#/errors/report", () => ({ report_degraded: vi.fn() }));

import { report_degraded } from "#/errors/report";
import { JEV_ENDPOINT, JEV_MODEL, jev_choice } from "./jev";

const question = {
  instructions: "Which layout?",
  criteria: { poster: "short", letter: "long" },
};

const answered = (choice: unknown, status = 200) =>
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({ answers: { q: { type: "choice", choice } } }),
        { status }
      )
  );

describe("jev_choice", () => {
  beforeEach(() => {
    env.ai_gateway.api_key = "test-key";
    vi.mocked(report_degraded).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the picked option and sends the pinned model", async () => {
    const fetch = answered("letter");
    vi.stubGlobal("fetch", fetch);
    expect(await jev_choice({ story_chars: 900 }, question)).toBe("letter");

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer test-key"
    );
    expect(JSON.parse(String(init.body))).toEqual({
      model: JEV_MODEL,
      state: { story_chars: 900 },
      questions: { q: { type: "choice", ...question } },
    });
  });

  it("returns null without a key and never calls out", async () => {
    env.ai_gateway.api_key = undefined;
    const fetch = answered("letter");
    vi.stubGlobal("fetch", fetch);
    expect(await jev_choice({}, question)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns null on an error status", async () => {
    vi.stubGlobal("fetch", answered("letter", 503));
    expect(await jev_choice({}, question)).toBeNull();
    expect(report_degraded).toHaveBeenCalledOnce();
  });

  it("returns null on an answer outside the criteria", async () => {
    vi.stubGlobal("fetch", answered("hub"));
    expect(await jev_choice({}, question)).toBeNull();
  });

  it("returns null on a body that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>bad gateway</html>", { status: 200 })
      )
    );
    expect(await jev_choice({}, question)).toBeNull();
    expect(report_degraded).toHaveBeenCalledOnce();
  });

  it("returns null on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    expect(await jev_choice({}, question)).toBeNull();
  });

  it("gives up at the timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason)
            )
          )
      )
    );
    const started = Date.now();
    expect(await jev_choice({}, question, 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    expect(report_degraded).toHaveBeenCalledOnce();
  });

  it("gives up after 800 ms when the caller sets no timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason)
            )
          )
      )
    );
    const started = performance.now();
    expect(await jev_choice({}, question)).toBeNull();
    const waited = performance.now() - started;
    // the abort signal's timer is the runtime's own, out of fake timers' reach
    expect(waited).toBeGreaterThanOrEqual(780);
    expect(waited).toBeLessThan(1500);
    expect(report_degraded).toHaveBeenCalledOnce();
  });
});

// the projects load .env.test; a key there lets any unmocked org loader call
// the real Jev endpoint
it("runs with no AI gateway key, so no test reaches the real Jev endpoint", () => {
  expect(process.env.AI_GATEWAY_API_KEY).toBeUndefined();
});
