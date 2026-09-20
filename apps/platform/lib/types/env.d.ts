import type { ClientKey, OptionalKey, ServerKey } from "../env";

declare global {
  namespace NodeJS {
    // the build/dev-time check (utils/check-env.ts) requires a non-blank value
    // for every key but the optional ones, so those read as `string` and an
    // optional key has to widen or a reader treats `undefined` as a string.
    // the deployed server never runs that check — there these are the
    // platform's values, unverified.
    interface ProcessEnv
      extends Record<Exclude<ServerKey, OptionalKey>, string>,
        Partial<Record<Extract<ServerKey, OptionalKey>, string>> {
      STAGE: "staging" | "production" | "local";
    }
  }
  interface ImportMetaEnv extends Record<ClientKey, string> {
    readonly VITE_STAGE: "staging" | "production" | "local";
  }
}
