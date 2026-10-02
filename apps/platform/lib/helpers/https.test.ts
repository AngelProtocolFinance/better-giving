import { describe, expect, test } from "vitest";
import { HttpError, json_ok, resp } from "./https";

describe("json_ok", () => {
  test("ok response yields the parsed body", async () => {
    const res = Response.json({ a: 1 });
    await expect(json_ok<{ a: number }>(res)).resolves.toEqual({ a: 1 });
  });

  test("a refusal throws with the status and the trimmed body text", async () => {
    const res = resp.refuse("  The minimum donation is $2.\n");
    const err = await json_ok<never>(res).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(400);
    expect(err.message).toBe("The minimum donation is $2.");
    expect(err.refused).toBe(true);
  });

  test("a refusal keeps the status it was given", async () => {
    const err = await json_ok<never>(resp.refuse("closed", 404)).catch(
      (e: HttpError) => e
    );
    expect(err.status).toBe(404);
    expect(err.message).toBe("closed");
  });

  test.each([
    ["an html page", "text/html", "<!doctype html><h1>Forbidden</h1>"],
    ["json", "application/json", '{"error":"rate limited"}'],
    ["unmarked plain text", "text/plain", "order_id: Invalid key"],
  ])(
    "4xx with %s throws unrefused, its message naming only the status",
    async (_, type, body) => {
      const res = new Response(body, {
        status: 429,
        headers: { "content-type": type },
      });
      const err = await json_ok<never>(res).catch((e: HttpError) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(429);
      expect(err.refused).toBe(false);
      expect(err.message).toBe("HTTP 429");
    }
  );

  test("5xx throws unrefused even when marked a refusal", async () => {
    const err = await json_ok<never>(resp.refuse("boom", 500)).catch(
      (e: HttpError) => e
    );
    expect(err.status).toBe(500);
    expect(err.refused).toBe(false);
    expect(err.message).toBe("HTTP 500");
  });

  test("a marked refusal with an empty body throws unrefused", async () => {
    const err = await json_ok<never>(resp.refuse("  ")).catch(
      (e: HttpError) => e
    );
    expect(err.refused).toBe(false);
    expect(err.message).toBe("HTTP 400");
  });

  test("5xx throws with the status naming it", async () => {
    const res = new Response("<!doctype html><h1>Application Error</h1>", {
      status: 500,
    });
    const err = await json_ok<never>(res).catch((e: HttpError) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(500);
    expect(err.name).toBe("HttpError");
    expect(err.message).toBe("HTTP 500");
  });
});
