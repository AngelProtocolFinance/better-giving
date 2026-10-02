import type { getDefaultIntegrations } from "@sentry/react-router";

// its client and server types re-export @sentry/browser and @sentry/node, each
// with an `Integration`, and the clash drops it from the package's own exports
type Integration = ReturnType<typeof getDefaultIntegrations>[number];

/** the defaults that capture an error before entry.client.tsx's listeners do */
const FIRST_CAPTURERS = new Set(["GlobalHandlers", "BrowserApiErrors"]);

/**
 * the `integrations` callback for the browser `Sentry.init`. the array form is
 * concatenated onto the defaults, so it can't remove one — only this form can.
 *
 * entry.client.tsx's own `error` / `unhandledrejection` listeners are the sink
 * for global errors. two defaults capture ahead of them, unclassified, and
 * Dedupe then drops our `report_unhandled` / `report_error` capture as the
 * duplicate: GlobalHandlers on the same window events, and BrowserApiErrors
 * inside the setTimeout / setInterval / requestAnimationFrame /
 * addEventListener / XHR callbacks it wraps, before rethrowing to `error`.
 */
export function client_integrations(defaults: Integration[]): Integration[] {
  return defaults.filter((i) => !FIRST_CAPTURERS.has(i.name));
}
