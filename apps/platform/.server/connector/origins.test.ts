import { describe, expect, test } from "vitest";
import { origin_allowed, request_origin } from "./origins";

describe("origin_allowed", () => {
  const env = {
    BASE_URL: "https://better.giving/app/",
    CONNECTOR_ORIGINS: " https://zap.example , , https://other.example:8443 ",
  };

  test("accepts the BASE_URL origin and a listed origin", () => {
    expect(origin_allowed("https://better.giving", env)).toBe(true);
    expect(origin_allowed("https://zap.example", env)).toBe(true);
    expect(origin_allowed("https://other.example:8443", env)).toBe(true);
  });

  test("rejects a different scheme, port, or host", () => {
    expect(origin_allowed("https://evil.example", env)).toBe(false);
    expect(origin_allowed("http://better.giving", env)).toBe(false);
    expect(origin_allowed("https://better.giving:444", env)).toBe(false);
    expect(origin_allowed("https://better.giving/app", env)).toBe(false);
  });
});

describe("request_origin", () => {
  test("is the request url's origin", () => {
    const request = new Request(
      "https://app.example:444/connector/v1/hello?x=1"
    );
    expect(request_origin(request)).toBe("https://app.example:444");
  });
});
