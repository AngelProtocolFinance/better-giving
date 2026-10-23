import { report_degraded } from "#/errors/report";
import { ai_gateway } from "./env";

/**
 * pinned so a model release can't move answers under us; bump on purpose.
 * `ai` 6 has no decision-model support (it lands in 7), so this posts to the
 * gateway's http endpoint directly.
 */
export const JEV_MODEL = "typesafe-ai/jev-1.14.0";
export const JEV_ENDPOINT = "https://ai-gateway.vercel.sh/v1/evaluate";
const TIMEOUT_MS = 800;

export interface IJevChoice<K extends string> {
  instructions: string;
  /** option name → what it means */
  criteria: Record<K, string>;
}

/**
 * asks Jev one choice question about `state`. resolves to the picked option,
 * or null on a missing key, timeout, error, or an answer outside `criteria` —
 * every caller has its own fallback, so this never throws.
 */
export async function jev_choice<K extends string>(
  state: string | Record<string, unknown>,
  question: IJevChoice<K>,
  timeout_ms = TIMEOUT_MS
): Promise<K | null> {
  if (!ai_gateway.api_key) return null;
  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ai_gateway.api_key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: JEV_MODEL,
        state,
        questions: { q: { type: "choice", ...question } },
      }),
      signal: AbortSignal.timeout(timeout_ms),
    });
    if (!res.ok) throw new Error(`jev ${res.status}`);
    const body = await res.json();
    const choice = body?.answers?.q?.choice;
    if (
      typeof choice === "string" &&
      Object.hasOwn(question.criteria, choice)
    ) {
      return choice as K;
    }
    throw new Error(`jev answered outside criteria: ${String(choice)}`);
  } catch (err) {
    report_degraded(err, { model: JEV_MODEL });
    return null;
  }
}
