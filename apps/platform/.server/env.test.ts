import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (o: Record<string, string>) => {
  for (const [k, v] of Object.entries(o)) vi.stubEnv(k, v);
  vi.resetModules();
  return import("./env");
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env: nowpayments host", () => {
  it("sandbox is read off the api host, not the stage", async () => {
    const prod = await load({
      STAGE: "production",
      NOWPAYMENTS_API_URL: "https://api.nowpayments.io",
    });
    expect(prod.nowpayments.is_sandbox).toBe(false);

    const staging = await load({
      STAGE: "staging",
      NOWPAYMENTS_API_URL: "https://api-sandbox.nowpayments.io/v1",
    });
    expect(staging.nowpayments.is_sandbox).toBe(true);
  });

  it("production on the sandbox host refuses to boot", async () => {
    await expect(
      load({
        STAGE: "production",
        NOWPAYMENTS_API_URL: "https://api-sandbox.nowpayments.io",
      })
    ).rejects.toThrow(/sandbox/);
  });

  it("a missing BASE_URL refuses to boot", async () => {
    await expect(load({ BASE_URL: "" })).rejects.toThrow(/BASE_URL/);
  });
});
