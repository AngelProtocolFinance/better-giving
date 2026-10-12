import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import * as v from "valibot";
import { reg_id } from "@/reg/schema";
import { int_gte1 } from "@/schemas";
import { app } from "../env";

/** how long a started connect may take to come back */
export const STATE_TTL_S = 15 * 60;

const connect_target = v.variant("kind", [
  v.object({ kind: v.literal("reg"), reg_id }),
  v.object({ kind: v.literal("npo"), npo_id: int_gte1 }),
]);
export type TConnectTarget = v.InferOutput<typeof connect_target>;

const connect_state = v.object({
  t: connect_target,
  /** the user who started it: only they may finish it */
  uid: v.string(),
  nonce: v.string(),
  /** unix seconds */
  exp: v.number(),
  /** the user confirmed replacing the account the target already holds */
  replace: v.boolean(),
});
export type IConnectState = v.InferOutput<typeof connect_state>;

// derived, not the session secret itself: a signature minted here must never
// verify anywhere the session secret signs
const key = createHmac("sha256", app.session_secret)
  .update("stripe-connect-state")
  .digest();

const mac = (body: string) => createHmac("sha256", key).update(body).digest();

export function sign_state(
  s: Pick<IConnectState, "t" | "uid" | "replace">
): string {
  const payload: IConnectState = {
    ...s,
    nonce: randomUUID(),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_S,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

export type TStateRead =
  | { status: "invalid" }
  | { status: "expired" | "valid"; state: IConnectState };

/** expired is still signed by us, so its target is safe to send the user back to */
export function read_state(token: string | null): TStateRead {
  const [body, sig, ...rest] = (token ?? "").split(".");
  if (!body || !sig || rest.length) return { status: "invalid" };

  const expected = mac(body);
  const received = Buffer.from(sig, "base64url");
  // timingSafeEqual throws on unequal lengths
  if (
    received.length !== expected.length ||
    !timingSafeEqual(expected, received)
  ) {
    return { status: "invalid" };
  }

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return { status: "invalid" };
  }
  const p = v.safeParse(connect_state, json);
  if (!p.success) return { status: "invalid" };

  const expired = p.output.exp * 1000 <= Date.now();
  return { status: expired ? "expired" : "valid", state: p.output };
}
