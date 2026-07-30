import type { ClientKey, ServerKey } from "../env";

declare global {
  namespace NodeJS {
    interface ProcessEnv extends Record<ServerKey, string> {
      STAGE: "staging" | "production" | "local";
    }
  }
  interface ImportMetaEnv extends Record<ClientKey, string> {
    readonly VITE_STAGE: "staging" | "production" | "local";
  }
}
