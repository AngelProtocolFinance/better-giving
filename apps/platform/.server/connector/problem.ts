export type ProblemCode =
  | "unknown_action"
  | "key_refused"
  | "rate_limited"
  | "code_invalid"
  | "idempotency_key_required"
  | "idempotency_conflict";

/** RFC 9457 body reduced to the two fields an integrator switches on. */
export function problem(status: number, code: ProblemCode): Response {
  return new Response(JSON.stringify({ code, status }), {
    status,
    headers: {
      "content-type": "application/problem+json",
      "cache-control": "no-store",
    },
  });
}
