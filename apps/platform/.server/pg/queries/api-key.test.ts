import { describe, expect, test, vi } from "vitest";

// 16 bytes: a valid base64 secret, the wrong length for aes-256
vi.mock("../../env", () => ({
  app: { api_encryption_key: "AAAAAAAAAAAAAAAAAAAAAA==" },
}));
vi.mock("../db", () => ({ db: {} }));

import { api_key_decode } from "./api-key";

describe("api_key_decode with a misconfigured secret", () => {
  test("throws instead of passing every key off as a bad token", () => {
    expect(() => api_key_decode("any-token")).toThrow(
      "APP_API_ENCRYPTION_KEY must decode to 32 bytes, got 16"
    );
  });
});
