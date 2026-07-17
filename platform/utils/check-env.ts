import { loadEnv } from "vite";
import {
  CLIENT_KEYS,
  type ClientKey,
  LOCAL_ONLY_KEYS,
  type LocalOnlyKey,
  SERVER_KEYS,
  type ServerKey,
} from "../lib/env";

const STAGES = ["staging", "production", "local"];

type RequiredKey = ServerKey | ClientKey | LocalOnlyKey;

// keys allowed to be "" as an opt-out signal. SENTRY_AUTH_TOKEN gates sourcemap
// upload in vite.config.ts — empty = skip upload locally.
const OPT_OUT_KEYS: readonly RequiredKey[] = ["SENTRY_AUTH_TOKEN"] as const;

// validates required env keys, merges loaded .env values into process.env (so
// runtime code via process.env still works), and returns a typed view for the
// vite config factory to read from instead of process.env.
export function check_env(mode: string) {
  // loadEnv pulls all keys (no prefix filter) from .env, .env.[mode],
  // .env.[mode].local, etc. — matches what vite/vitest see at runtime.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "") };
  Object.assign(process.env, env);

  const required = [
    ...SERVER_KEYS,
    ...CLIENT_KEYS,
    ...(env.STAGE === "local" ? LOCAL_ONLY_KEYS : []),
  ];
  const missing = required.filter((k) =>
    OPT_OUT_KEYS.includes(k) ? env[k] === undefined : !env[k]
  );
  if (missing.length) {
    throw new Error(
      `missing env vars (${missing.length}):\n  - ${missing.join("\n  - ")}`
    );
  }

  for (const k of ["STAGE", "VITE_STAGE"] as const) {
    const v = env[k];
    if (!v || !STAGES.includes(v)) {
      throw new Error(`${k}=${v} must be one of ${STAGES.join(",")}`);
    }
  }

  return env as Record<ServerKey | ClientKey, string> & {
    VERCEL_GIT_COMMIT_SHA?: string;
    VITEST?: string;
  };
}
