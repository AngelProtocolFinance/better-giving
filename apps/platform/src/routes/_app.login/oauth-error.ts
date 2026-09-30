import { href } from "react-router";

/** better-auth's `redirectOnError` appends both */
const OAUTH_ERROR_PARAMS = ["error", "error_description"];

/** both login forms post to this page's url, which would keep an oauth error on screen */
export function retry_form_action(params: URLSearchParams): string | undefined {
  if (!params.has("error")) return undefined;
  const kept = new URLSearchParams(params);
  for (const k of OAUTH_ERROR_PARAMS) kept.delete(k);
  return `${href("/login")}?${kept}`;
}
