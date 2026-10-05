import { data } from "react-router";
import * as v from "valibot";
import { user_ctx } from "#/.server/auth";
import type { IOwedRow } from "#/pages/platform-admin/owed/types";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import {
  admin_credit_owed,
  owed_list,
  write_off_owed,
} from "$/pg/queries/owed";
import type { Route } from "./+types/route";

const list_query = v.object({
  party: v.optional(v.picklist(["all", "npo", "referrer"]), "all"),
  sort: v.optional(v.picklist(["date", "outstanding"]), "date"),
  dir: v.optional(v.picklist(["asc", "desc"]), "desc"),
  next: v.optional(v.string()),
});

export const loader = async ({ request }: Route.LoaderArgs) => {
  const s = new URL(request.url).searchParams;
  const p = v.safeParse(list_query, {
    party: s.get("party") ?? undefined,
    sort: s.get("sort") ?? undefined,
    dir: s.get("dir") ?? undefined,
    next: s.get("next") ?? undefined,
  });
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const { party, sort, dir, next } = p.output;

  const page = await owed_list({
    party: party === "all" ? undefined : party,
    sort,
    dir,
    next,
  });
  const items: IOwedRow[] = page.items;
  return { items, next: page.next, party, sort, dir };
};

const reason = v.pipe(v.string(), v.trim(), v.nonEmpty("A reason is required"));
const owed_id = v.pipe(v.string(), v.nonEmpty("A row is required"));

const body = v.variant("intent", [
  v.object({ intent: v.literal("write_off"), owed_id, reason }),
  v.object({
    intent: v.literal("credit"),
    owed_id,
    usd: v.pipe(
      v.number("An amount is required"),
      v.finite("An amount is required"),
      v.gtValue(0, "The amount must be more than $0")
    ),
    reason,
    ref: v.pipe(v.string(), v.trim(), v.nonEmpty("A reference is required")),
  }),
]);
type TBody = v.InferOutput<typeof body>;

interface IDone {
  ok: true;
  /** the write-off went through and the row still owes this much */
  remainder_usd?: number;
}

const refuse = (status: number, error: string) =>
  data({ ok: false as const, error }, { status });

const OVER = "That is more than this row has outstanding";
class OverCredit extends Error {}

export const action = async ({ request, context }: Route.ActionArgs) => {
  const p = v.safeParse(body, await request.json().catch(() => null));
  if (p.issues) return refuse(400, p.issues[0].message);
  const actor = context.get(user_ctx).id;
  const now = new Date().toISOString();

  try {
    return p.output.intent === "write_off"
      ? await write_off(p.output, actor, now)
      : await credit(p.output, actor, now);
  } catch (err) {
    // with the body parsed, settling past what the row owes is the one check
    // left to fire
    if (err instanceof OverCredit || is_check_violation(err)) {
      return refuse(409, OVER);
    }
    throw err;
  }
};

async function write_off(
  x: Extract<TBody, { intent: "write_off" }>,
  actor: string,
  now: string
) {
  const row = await db.transaction((tx) =>
    write_off_owed(tx, { owed_id: x.owed_id, reason: x.reason, actor, now })
  );
  if (!row) return refuse(409, "Nothing left to write off");
  const left = row.outstanding_usd ?? 0;
  const done: IDone = { ok: true, remainder_usd: left > 0 ? left : undefined };
  return done;
}

async function credit(
  x: Extract<TBody, { intent: "credit" }>,
  actor: string,
  now: string
) {
  const { owed_id, usd, reason, ref } = x;
  const row = await db.transaction(async (tx) => {
    const r = await admin_credit_owed(tx, {
      owed_id,
      usd,
      reason,
      ref,
      actor,
      now,
    });
    // past what is outstanding the party would be due money back; throwing
    // rolls the credit back
    if (r && (r.outstanding_usd ?? 0) < 0) throw new OverCredit();
    return r;
  });
  if (!row) return refuse(404, "This row no longer exists");
  const done: IDone = { ok: true };
  return done;
}

/** drizzle wraps the driver's error, so the postgres code sits on a `cause` */
function is_check_violation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    if ((e as Error & { code?: unknown }).code === "23514") return true;
  }
  return false;
}
