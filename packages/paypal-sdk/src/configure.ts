import type { PayPalClient } from "./client.js";

// generated clients (openapi-typescript-codegen) each read a module-global `OpenAPI`
// singleton at request time, so configuring one mutates shared state. two clients on
// different environments would otherwise silently reroute each other's requests —
// refuse a conflicting environment loudly instead of writing against the wrong account.
export const apply_client = <
  T extends { OpenAPI: { BASE: string; TOKEN?: unknown } },
>(
  mod: T,
  client: PayPalClient
): T => {
  const base = client.get_base_url();
  // TOKEN is undefined until a client configures the module; a set TOKEN with a
  // different BASE means a second client on another environment — unsupported.
  if (mod.OpenAPI.TOKEN && mod.OpenAPI.BASE !== base) {
    throw new Error(
      "PayPal SDK: this API service was already configured for a different environment; " +
        "generated clients share module-global state, so a process supports one PayPal environment at a time."
    );
  }
  mod.OpenAPI.BASE = base;
  mod.OpenAPI.TOKEN = async () => await client.get_access_token();
  return mod;
};
