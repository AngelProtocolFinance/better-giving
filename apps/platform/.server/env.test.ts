import { afterEach, describe, expect, it, vi } from "vitest";
import { OPTIONAL_KEYS, SERVER_KEYS } from "@/env";
import { ALCHEMY_CHAINS } from "./alchemy-webhook/types";

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

describe("env: BASE_URL", () => {
  it.each([
    ["https://better.giving/", "https://better.giving"],
    ["https://better.giving//", "https://better.giving"],
    ["https://better.giving", "https://better.giving"],
  ])("%s reads as %s", async (raw, expected) => {
    const env = await load({ BASE_URL: raw });
    expect(env.base_url).toBe(expected);
  });
});

describe("env: alchemy signing keys", () => {
  it.each(Object.entries(ALCHEMY_CHAINS))(
    "%s reads its key from the env var its chain names",
    async (chain_id, { signing_key_env }) => {
      const env = await load({ [signing_key_env]: `key-of-${chain_id}` });
      expect(env.alchemy_signing_key).toEqual(
        expect.objectContaining({ [chain_id]: `key-of-${chain_id}` })
      );
    }
  );

  it("every chain's key is a declared, optional server key", () => {
    const names = Object.values(ALCHEMY_CHAINS).map((c) => c.signing_key_env);
    expect(OPTIONAL_KEYS).toEqual(expect.arrayContaining(names));
    expect(SERVER_KEYS).toEqual(expect.arrayContaining(names));
  });
});

describe("env: owed deductions", () => {
  it("are on only for the value on", async () => {
    expect((await load({ OWED_DEDUCTIONS: "on" })).owed_deductions).toBe(true);
  });

  // an optional key's usual test is truthiness, which would read these as on
  it.each(["", "off", "false", "0", "ON", "true"])(
    "%j leaves them off",
    async (value) => {
      const env = await load({ OWED_DEDUCTIONS: value });
      expect(env.owed_deductions).toBe(false);
    }
  );
});

describe("env: owed terms effective date", () => {
  it("a calendar date is its midnight in utc", async () => {
    const env = await load({ OWED_TERMS_EFFECTIVE: "2026-11-01" });
    expect(env.owed_terms_effective).toBe("2026-11-01T00:00:00.000Z");
  });

  it("an instant keeps its offset", async () => {
    const env = await load({
      OWED_TERMS_EFFECTIVE: "2026-11-01T00:00:00-05:00",
    });
    expect(env.owed_terms_effective).toBe("2026-11-01T05:00:00.000Z");
  });

  it.each(["", "   "])("%j is no date", async (value) => {
    const env = await load({ OWED_TERMS_EFFECTIVE: value });
    expect(env.owed_terms_effective).toBeNull();
  });

  // a typo read as unset would hide every row from its party in silence
  it.each(["11/01/2026", "2026-02-30", "2026-11-01T00:00", "soon"])(
    "%j refuses to boot",
    async (value) => {
      await expect(load({ OWED_TERMS_EFFECTIVE: value })).rejects.toThrow(
        /OWED_TERMS_EFFECTIVE/
      );
    }
  );
});
