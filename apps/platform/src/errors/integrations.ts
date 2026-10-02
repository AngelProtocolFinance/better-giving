import type { Integration } from "@sentry/react-router";

/**
 * the `integrations` callback for the browser `Sentry.init`. the array form is
 * concatenated onto the defaults, so it can't remove one — only this form can.
 *
 * GlobalHandlers goes because entry.client.tsx's own `error` /
 * `unhandledrejection` listeners are the sink for global errors: left on, it
 * captures first, unclassified, and Dedupe then drops our `report_unhandled` /
 * `report_error` capture as the duplicate.
 */
export function client_integrations(defaults: Integration[]): Integration[] {
  return defaults.filter((i) => i.name !== "GlobalHandlers");
}
