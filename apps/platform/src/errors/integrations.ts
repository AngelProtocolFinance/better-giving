/**
 * the `integrations` value for the browser `Sentry.init` in `entry.client.tsx`.
 *
 * two of sentry's defaults capture on their own, and both have to come out or
 * `report.ts` is not the sink it is written to be:
 *
 * - `GlobalHandlers` installs its `onerror` and `onunhandledrejection` during
 *   `Sentry.init`, so it is registered ahead of the listeners
 *   `entry.client.tsx` adds right after.
 * - `BrowserApiErrors` wraps timer and `addEventListener` callbacks; on a throw
 *   it captures and only then rethrows, so it reports before the rethrow
 *   reaches `window.onerror` at all. its `ignoreNextOnError()` suppresses
 *   sentry's own handler afterwards but not ours.
 *
 * either way the untagged `level:error` capture is sent first and `Dedupe`
 * drops ours behind it — dedupe compares the message, fingerprint and
 * stacktrace and never the level or the tags, so the copy that survives is the
 * unclassified one. the `report:bug` / `report:degraded` split and `report.ts`'s
 * apple-pay downgrade both stop reaching sentry while their own unit tests stay
 * green.
 *
 * nothing stops being reported: an error thrown in a timer or a listener
 * reaches `window.onerror` on its own once it is no longer swallowed and
 * rethrown, and that is the listener `entry.client.tsx` owns.
 *
 * the callback shape is load-bearing. an `integrations` ARRAY is concatenated
 * onto the defaults rather than replacing them, so `integrations: []` removes
 * nothing at all; only this form can drop one. `defaultIntegrations: false`
 * would drop every default, and the breadcrumbs, dedupe and http context are
 * what make an event off a donor's browser readable.
 *
 * typed structurally rather than against `Integration`: that type lives in
 * `@sentry/core`, which platform does not depend on directly.
 */
const CAPTURES_ITSELF = ["GlobalHandlers", "BrowserApiErrors"];

export const client_integrations = <T extends { name: string }>(
  defaults: T[]
): T[] => defaults.filter((i) => !CAPTURES_ITSELF.includes(i.name));
