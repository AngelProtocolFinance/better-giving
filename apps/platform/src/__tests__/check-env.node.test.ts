import { resolve } from "node:path";
import { chdir, cwd } from "node:process";
import { describe, expect, test } from "vitest";
import { CLIENT_KEYS, OPTIONAL_KEYS, SERVER_KEYS } from "../../lib/env";
import { check_env, missing_keys } from "../../utils/check-env";

// node project, not browser: check_env reads `.env*` off disk, and this drives
// `chdir` (main-thread only — see the node project's `pool` in vite.config.ts).
//
// the `.env*` files live only in apps/platform, with nothing at the monorepo
// root to fall back on, so a launch-directory resolution finds none of them.
const repo_root = resolve(import.meta.dirname, "../../../..");

// ProcessEnv declares every server key required (lib/types/env.d.ts), so a key
// is not optional to `delete` without widening first.
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

  test("a value from .env.test beats the same key exported in the shell", () => {
    const prev_secret = process.env.APP_SESSION_SECRET;
    // loadEnv applies process.env last, so unless check_env puts the `.env*`
    // files back on top, this exported value is what the whole suite runs on.
    env.APP_SESSION_SECRET = "exported-never-read-from-a-file";
    try {
      const loaded = check_env("test", false);

      expect(loaded.APP_SESSION_SECRET).not.toBe(
        "exported-never-read-from-a-file"
      );
      expect(loaded.APP_SESSION_SECRET).toEqual(expect.any(String));
      expect(env.APP_SESSION_SECRET).toBe(loaded.APP_SESSION_SECRET);
    } finally {
      if (prev_secret === undefined) delete env.APP_SESSION_SECRET;
      else env.APP_SESSION_SECRET = prev_secret;
    }
  });

  // the files win for the declared keys only, and by unsetting them across the
  // load — everything else in the environment has to come back untouched,
  // which is also what lets a deploy with no `.env*` files resolve at all.
  test("keeps ambient values the files never declare", () => {
    const ambient_key = "CHECK_ENV_AMBIENT_ONLY" as const;
    process.env[ambient_key] = "from-the-shell";
    try {
      const loaded = check_env("test", false) as unknown as Record<
        string,
        string
      >;

      expect(loaded[ambient_key]).toBe("from-the-shell");
      expect(process.env[ambient_key]).toBe("from-the-shell");
    } finally {
      delete process.env[ambient_key];
    }
  });

  // the throw is what failed a staging deploy, and no test in this file had
  // ever run the validating path. `.env.test` is committed with a value for
  // every declared key, so this needs no secret.
  test("validation passes against the committed .env.test", () => {
    expect(() => check_env("test", true)).not.toThrow();
  });
});

// the deploy platform decides how an unset key reaches the build: vercel's
// dashboard rejects a blank value, so an optional key can only be expressed
// there by leaving it out. a build that refused to start over one cost a
// staging deploy.
describe("missing_keys", () => {
  const full = () =>
    Object.fromEntries([...SERVER_KEYS, ...CLIENT_KEYS].map((k) => [k, "x"]));

  // OPTIONAL_KEYS is a literal tuple, so `.includes` rejects a plain string —
  // hence the wider type on this binding.
  const optional: readonly string[] = OPTIONAL_KEYS;
  const required = [...SERVER_KEYS, ...CLIENT_KEYS].filter(
    (k) => !optional.includes(k)
  );

  const states = [
    ["absent", undefined],
    ["empty", ""],
    ["whitespace-only", "   "],
    ["set", "sntrys_real_token"],
  ] as const;

  // spelled out rather than read off OPTIONAL_KEYS: an expectation derived from
  // the registry moves with it and asserts nothing, so a key that must never be
  // optional could be added with the suite still green. widening is an edit
  // here, deliberately.
  test("the optional registry holds exactly these keys", () => {
    expect([...OPTIONAL_KEYS]).toEqual(["SENTRY_AUTH_TOKEN", "SENTRY_PROJECT"]);
  });

  // one case per key rather than a shared loop: a loop's failure names no key
  // and aborts before the later ones run.
  test.each(
    OPTIONAL_KEYS.flatMap((key) =>
      states.map(([state, value]) => ({ key, state, value }))
    )
  )("optional $key is satisfied $state", ({ key, value }) => {
    const vars = full();
    if (value === undefined) delete vars[key];
    else vars[key] = value;

    expect(missing_keys(vars)).toEqual([]);
  });

  // every required key in the same state at once, against the derived list: a
  // key silently treated as optional drops out of the result and the diff names
  // it. whitespace is what an operator types at a field that refuses to be
  // blank.
  test.each(states.filter(([state]) => state !== "set"))(
    "every other key is reported %s",
    (_state, value) => {
      const vars = full();
      for (const k of required) {
        if (value === undefined) delete vars[k];
        else vars[k] = value;
      }

      expect(missing_keys(vars)).toEqual(required);
    }
  );
});
