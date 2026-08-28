import { resolve } from "node:path";
import { chdir, cwd } from "node:process";
import { describe, expect, test } from "vitest";
import { check_env } from "../../utils/check-env";

// node project, not browser: check_env reads `.env*` off disk.
//
// the `.env*` files live only in apps/platform — there are none at the
// monorepo root. a resolution that keys off the launch directory therefore
// finds nothing whenever vitest is started from the root (`vitest --root
// apps/platform` from anywhere but the package dir), and every consumer of
// `$/env` silently gets undefined. APP_SESSION_SECRET going missing that way
// surfaces as `DataError: HMAC key data must not be empty` at cookie-sign
// time, fifteen seconds into a route test.
const repo_root = resolve(import.meta.dirname, "../../../..");

// ProcessEnv declares every server key required (lib/types/env.d.ts), so the
// keys are not optional to `delete` without widening first.
const env = process.env as Partial<NodeJS.ProcessEnv>;

describe("check_env", () => {
  test("resolves .env.test from the platform package, not the launch directory", () => {
    const prev_cwd = cwd();
    const prev_secret = process.env.APP_SESSION_SECRET;
    // the `...process.env` spread would otherwise supply the value the
    // resolution is being tested for.
    delete env.APP_SESSION_SECRET;
    try {
      chdir(repo_root);
      const loaded = check_env("test", false);

      expect(loaded.APP_SESSION_SECRET).toEqual(expect.any(String));
      expect(loaded.APP_SESSION_SECRET).not.toBe("");
      // consumers read `process.env` at module scope, not this return value
      expect(env.APP_SESSION_SECRET).toBe(loaded.APP_SESSION_SECRET);
    } finally {
      chdir(prev_cwd);
      if (prev_secret === undefined) delete env.APP_SESSION_SECRET;
      else env.APP_SESSION_SECRET = prev_secret;
    }
  });
});
