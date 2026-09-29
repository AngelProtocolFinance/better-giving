/**
 * the `integrations` value for the browser `Sentry.init` in `entry.client.tsx`.
 *
 * sentry's own `GlobalHandlers` has to come out. it installs its `onerror` and
 * `onunhandledrejection` listeners during `Sentry.init`, so it is registered
 * ahead of the listeners `entry.client.tsx` adds right after — its untagged
 * `level:error` capture is sent first, and `Dedupe` then drops ours behind it.
 * dedupe compares the message, fingerprint and stacktrace and never the level
 * or the tags, so the copy that survives is the unclassified one: the
 * `report:bug` / `report:degraded` split and `report.ts`'s apple-pay downgrade
 * both stop reaching sentry while their own unit tests stay green.
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
export const client_integrations = <T extends { name: string }>(
  defaults: T[]
): T[] => defaults.filter((i) => i.name !== "GlobalHandlers");
