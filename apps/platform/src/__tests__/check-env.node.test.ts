import { resolve } from "node:path";
import { chdir, cwd } from "node:process";
import { describe, expect, test } from "vitest";
import { check_env } from "../../utils/check-env";

// node project, not browser: check_env reads `.env*` off disk, and this drives
// `chdir` (main-thread only — see the node project's `pool` in vite.config.ts).
//
// the `.env*` files live only in apps/platform, with nothing at the monorepo
// root to fall back on, so a launch-directory resolution finds none of them.
const repo_root = resolve(import.meta.dirname, "../../../..");

// widened to delete a key — see env-guard.node.test.ts for why the declared
// ProcessEnv leaves it non-optional.
const env = process.env as Partial<NodeJS.ProcessEnv>;

describe("check_env", () => {
  test("resolves .env.test from the platform package, not the launch directory", () => {
    const prev_cwd = cwd();
    const prev_secret = process.env.APP_SESSION_SECRET;
    // loadEnv's last pass copies process.env over the parsed files, so an
    // exported value satisfies the assertion without a file ever being read.
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
