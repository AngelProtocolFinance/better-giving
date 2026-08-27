import * as Sentry from "@sentry/react-router";

// user errors (4xx Responses, thrown data() with 4xx status) are expected and
// must not page the team. only unexpected exceptions / 5xx bubble to sentry.
function is_user_error(err: unknown): boolean {
  if (err instanceof Response) return err.status >= 400 && err.status < 500;
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    return typeof s === "number" && s >= 400 && s < 500;
  }
  return false;
}

// wrap non-Error throws so sentry gets a stack from the report site.
// handles cross-realm Error objects (instanceof fails across iframes/workers).
function normalize(err: unknown): unknown {
  if (err instanceof Error || err instanceof Response) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object") {
    const msg =
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
        ? (err as { message: string }).message
        : JSON.stringify(err);
    const wrapped = new Error(msg || "(no message)");
    if (
      "stack" in err &&
      typeof (err as { stack: unknown }).stack === "string"
    ) {
      wrapped.stack = (err as { stack: string }).stack;
    }
    return wrapped;
  }
  return new Error(err === undefined ? "(undefined error)" : String(err));
}

/**
 * safari refuses `ApplePaySession` when a third party embeds `/forms/:id` over
 * plain http, and stripe's availability probe throws it inside a promise nobody
 * owns — so it lands in the unhandled-rejection sink. nothing of ours is broken:
 * apple pay simply doesn't render and every other method works, and http
 * embedders are not a supported configuration.
 *
 * both halves are required. the name alone is a generic dom error and keying on
 * it would bury real defects. read as plain properties rather than
 * `instanceof DOMException` because the rejection crosses the embedder's realm,
 * where instanceof fails — the same reasoning `normalize` already carries.
 */
function is_apple_pay_insecure_parent(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  return (
    name === "InvalidAccessError" &&
    typeof message === "string" &&
    /apple pay session from a document with an insecure parent frame/i.test(
      message
    )
  );
}

function capture(
  error: unknown,
  level: "error" | "warning",
  context?: Record<string, unknown>
): void {
  if (level === "error") console.error(error, context);
  else console.warn(error, context);
  if (is_user_error(error)) return;
  // preserve the original non-Error value as extra context so opaque objects aren't lost.
  const extra =
    error instanceof Error || error instanceof Response
      ? context
      : { ...context, original_error: error };
  Sentry.captureException(normalize(error), {
    level,
    ...(extra ? { extra } : {}),
  });
}

export function report_error(
  error: unknown,
  context?: Record<string, unknown>
): void {
  capture(error, "error", context);
}

/**
 * a third party we don't control was unreachable from the visitor's browser —
 * a blocked script, a dropped fetch, an sdk that never came up. nothing in this
 * repo is broken when one fires, and they outnumber real defects by orders of
 * magnitude, so they're kept at warning level: `level:error` stays a list of
 * our own bugs, while a provider outage is still visible as a rate change.
 *
 * only for failures already handled — the caller must have degraded the ui.
 */
export function report_degraded(
  error: unknown,
  context?: Record<string, unknown>
): void {
  capture(error, "warning", context);
}

/**
 * the `unhandledrejection` sink: a rejection nobody owns, classified before it
 * is levelled. everything unrecognised is still an error — this is a list of
 * known third-party noise, not a filter over our own bugs.
 */
export function report_unhandled(reason: unknown): void {
  if (is_apple_pay_insecure_parent(reason)) {
    report_degraded(reason);
    return;
  }
  report_error(reason);
}

// .catch-friendly variants that report + return a value.

export function report_null(error: unknown): null {
  report_error(error);
  return null;
}

export function report_degraded_null(error: unknown): null {
  report_degraded(error);
  return null;
}

export function report_undefined(error: unknown): undefined {
  report_error(error);
  return undefined;
}

export function report_msg(error: unknown, msg: string): string {
  report_error(error);
  return msg;
}

export function report_obj<T>(error: unknown, value: T): T {
  report_error(error);
  return value;
}

function extract_msg(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Server Error";
}

export function report_resp(
  error: unknown,
  message?: string,
  status = 500
): Response {
  report_error(error);
  return new Response(message ?? extract_msg(error), { status });
}
