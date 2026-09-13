import { describe, expect, test } from "vitest";
import { HttpError, json_ok } from "./https";

describe("json_ok", () => {
  test("ok response yields the parsed body", async () => {
    const res = Response.json({ a: 1 });
    await expect(json_ok<{ a: number }>(res)).resolves.toEqual({ a: 1 });
  });

  test("plain-text 4xx throws with the status and the trimmed body text", async () => {
    const res = new Response("  The minimum donation is $2.\n", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
    const err = await json_ok<never>(res).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("The minimum donation is $2.");
  });

  test.each([
    ["an html page", "text/html", "<!doctype html><h1>Forbidden</h1>"],
    ["json", "application/json", '{"error":"rate limited"}'],
  ])("4xx with %s throws with the status and no message", async (_, type, body) => {
    const res = new Response(body, {
      status: 429,
      headers: { "content-type": type },
    });
    const err = await json_ok<never>(res).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("");
  });

  test("5xx throws with the status and no message", async () => {
    const res = new Response("<!doctype html><h1>Application Error</h1>", {
      status: 500,
    });
    const err = await json_ok<never>(res).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("");
  });
});
