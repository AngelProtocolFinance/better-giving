import { and, eq, isNull, ne, or } from "drizzle-orm";
import { steps } from "#/pages/registration/routes";
import { EDITABLE } from "@/reg/schema";
import {
  CONNECT_REASON_PARAM,
  CONNECT_RESULT_PARAM,
  type TConnectErrorReason,
  type TConnectResult,
} from "@/stripe-connect/return";
import { db } from "../pg/db";
import { reg_get } from "../pg/queries/registration";
import { npos } from "../pg/schema/npo";
import { registrations } from "../pg/schema/registration";
import { user_npo_memberships } from "../pg/schema/user";
import type { TConnectTarget } from "./state";

export interface IConnectActor {
  id: string;
  email: string;
  role?: string | null;
}

export type TTargetAccess =
  | { ok: true; acct: string | null }
  | { ok: false; status: 403 | 404 };

/** whether `actor` may connect an account to `t`, and the account it holds now.
 * registration: its applicant or an admin, while it is still editable.
 * npo: a member or an admin. */
export async function target_access(
  actor: IConnectActor,
  t: TConnectTarget
): Promise<TTargetAccess> {
  const is_admin = actor.role === "admin";

  if (t.kind === "reg") {
    const reg = await reg_get(t.reg_id);
    if (!reg) return { ok: false, status: 404 };
    if (reg.r_id !== actor.email && !is_admin)
      return { ok: false, status: 403 };
    // in review or decided, the write is refused anyway — refused here, it is
    // refused before stripe links an account that would then be stored nowhere
    if (!EDITABLE.includes(reg.status)) return { ok: false, status: 403 };
    return { ok: true, acct: reg.o_stripe_account_id ?? null };
  }

  const [npo] = await db
    .select({ acct: npos.stripe_account_id })
    .from(npos)
    .where(eq(npos.id, t.npo_id));
  if (!npo) return { ok: false, status: 404 };
  if (is_admin) return { ok: true, acct: npo.acct };

  const [member] = await db
    .select({ npo_id: user_npo_memberships.npo_id })
    .from(user_npo_memberships)
    .where(
      and(
        eq(user_npo_memberships.user_id, actor.id),
        eq(user_npo_memberships.npo_id, t.npo_id)
      )
    )
    .limit(1);
  return member ? { ok: true, acct: npo.acct } : { ok: false, status: 403 };
}

/** whether `acct` already belongs to an npo or a registration other than `t`.
 * approved registrations are skipped: their account lives on the npo now, or
 * was replaced there. a pending one would collide with this one at approval. */
export async function held_elsewhere(
  acct: string,
  t: TConnectTarget
): Promise<boolean> {
  const [npo] = await db
    .select({ id: npos.id })
    .from(npos)
    .where(
      and(
        eq(npos.stripe_account_id, acct),
        t.kind === "npo" ? ne(npos.id, t.npo_id) : undefined
      )
    )
    .limit(1);
  if (npo) return true;

  const [reg] = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(
      and(
        eq(registrations.o_stripe_account_id, acct),
        or(isNull(registrations.status), ne(registrations.status, "03")),
        t.kind === "reg" ? ne(registrations.id, t.reg_id) : undefined
      )
    )
    .limit(1);
  return !!reg;
}

/** the page a connect for `t` started from, carrying how it ended */
export function return_path(
  t: TConnectTarget,
  result: Exclude<TConnectResult, "error">
): string;
export function return_path(
  t: TConnectTarget,
  result: "error",
  reason: TConnectErrorReason
): string;
export function return_path(
  t: TConnectTarget,
  result: TConnectResult,
  reason?: TConnectErrorReason
): string {
  const path =
    t.kind === "reg"
      ? `/register/${t.reg_id}/${steps.banking}`
      : `/admin/${t.npo_id}/banking`;
  const q = new URLSearchParams({ [CONNECT_RESULT_PARAM]: result });
  if (reason) q.set(CONNECT_REASON_PARAM, reason);
  return `${path}?${q}`;
}
