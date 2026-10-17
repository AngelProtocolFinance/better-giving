import { describe, expect, test } from "vitest";
import { connector_return_url } from "./return-url";

const PRODUCTION = "https://app.connect.better.giving/connect/return";

describe("connector_return_url", () => {
  test("production ignores CONNECTOR_RETURN_URL", () => {
    expect(
      connector_return_url({
        VERCEL_ENV: "production",
        CONNECTOR_RETURN_URL: "https://evil.example/steal",
      })
    ).toBe(PRODUCTION);
  });

  test("preview returns the configured absolute url", () => {
    expect(
      connector_return_url({
        VERCEL_ENV: "preview",
        CONNECTOR_RETURN_URL: "https://evil.example/steal",
      })
    ).toBe("https://evil.example/steal");
  });

  test("an unset override and an unset VERCEL_ENV return the production url", () => {
    expect(connector_return_url({})).toBe(PRODUCTION);
  });
});
