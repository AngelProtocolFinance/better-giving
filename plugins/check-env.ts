import { loadEnv, type Plugin } from "vite";
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

export function check_env(): Plugin {
  return {
    name: "check-env",
    enforce: "pre",
    configResolved(config) {
      // loadEnv pulls all keys (no prefix filter) from .env, .env.[mode],
      // .env.[mode].local, etc. — matches what vite/vitest see at runtime.
      const loaded = loadEnv(config.mode, process.cwd(), "");
      const env = { ...process.env, ...loaded };

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
    },
  };
}
