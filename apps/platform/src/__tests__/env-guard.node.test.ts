import { afterEach, describe, expect, test, vi } from "vitest";

// node project, not browser: this is about what `$/env` does at module load
// against a real `process.env`. the browser project defines every key as a
// literal (vite.config.ts), so the unset branch is unreachable there.
//
// ProcessEnv declares every server key required (lib/types/env.d.ts), so the
// keys are not optional to `delete` without widening first.
const env = process.env as Partial<NodeJS.ProcessEnv>;

type GuardedKey =
  | "APP_SESSION_SECRET"
  | "APP_COOKIE_SECRET"
  | "APP_API_ENCRYPTION_KEY";

const without = async (key: GuardedKey) => {
  const prev = env[key];
  delete env[key];
  vi.resetModules();
  try {
    return await import("$/env").then(
      () => null,
      (e: Error) => e
    );
  } finally {
    if (prev === undefined) delete env[key];
    else env[key] = prev;
    vi.resetModules();
  }
};

afterEach(() => {
  vi.resetModules();
});

describe("$/env", () => {
  // a deployed server never runs check_env — it only loads at build and at
  // dev-server start. without this the miss reaches cookie signing and surfaces
  // as `DataError: HMAC key data must not be empty`, naming nothing.
  //
  // the key name is a free string beside the property it reads, so each case
  // asserts its own name: a copy-paste swap between two of them stays green
  // against a shared assertion.
  test.each<GuardedKey>([
    "APP_SESSION_SECRET",
    "APP_COOKIE_SECRET",
    "APP_API_ENCRYPTION_KEY",
  ])("a missing %s fails at module load, naming the variable", async (key) => {
    const err = await without(key);

    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toBe(`${key} is not set`);
  });
});
