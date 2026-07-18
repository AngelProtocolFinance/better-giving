import * as v from "valibot";
import type { IDonation } from "@/donations";
import type { IInput, IParts } from "@/types/donation-dist";
import { db } from "$/pg/db";
import { donation_put } from "$/pg/queries/donation";
import { nav_ltd } from "$/pg/queries/nav";
import { npo_get } from "$/pg/queries/npo";
import { preview_settlement } from "$/settlement/preview";
import { settle_npo } from "$/settlement/settle-npo";
import type { Route } from "./+types/route";

const schema = v.object({
  from: v.optional(v.picklist(["cheque", "daf"]), "cheque"),
  npo_id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
  donor_name: v.optional(v.pipe(v.string(), v.nonEmpty()), "Anonymous"),
  donor_email: v.optional(
    v.pipe(v.string(), v.nonEmpty()),
    "settlement@better.giving"
  ),
  net: v.pipe(v.string(), v.transform(Number), v.minValue(0.01)),
  reference: v.pipe(v.string(), v.nonEmpty()),
});

// builds the IInput used by both loader (preview) and action (execute)
function build_input(
  npo_id: number,
  npo_name: string,
  net: number,
  nav_price: number,
  sttl_id: string,
  parent_id: string,
  now: string,
  via: string,
  parsed: { donor_email: string; donor_name: string; reference: string }
): IInput {
  const zero = { base: 0, tip: 0, fee_allowance: 0 } as const;
  const ps: IParts = {
    amnt: { base: net, tip: 0, fee_allowance: 0 },
    amnt_usd: { base: net, tip: 0, fee_allowance: 0 },
    fa: { ...zero },
    sttl: { base: net, tip: 0, fee_allowance: 0 },
    sttl_fee: { ...zero },
    sttl_fa: { ...zero },
  };

  return {
    id: npo_id,
    ps,
    sttl: { id: sttl_id, date: now, currency: "USD" },
    prnt: {
      id: parent_id,
      to_id: npo_id.toString(),
      to_name: npo_name,
      to_members: [],
      type: "npo",
    },
    source: undefined,
    program: undefined,
    nav_price,
    tx: {
      upusd: 1,
      status: "settled",
      updated_at: now,
      currency: "USD",
      source: "bg-marketplace",
      frequency: "one-time",
      via,
      via_extra: parsed.reference,
      from_email: parsed.donor_email,
      from_name: parsed.donor_name,
      from_public: false,
    },
  };
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  const { searchParams: s } = new URL(request.url);
  const npo_id = Number(s.get("npo_id"));
  const gross = Number(s.get("net"));
  if (!npo_id || !gross || gross <= 0) {
    return { preview: null };
  }

  const nav = await nav_ltd();
  const now = new Date().toISOString();
  const npo = await npo_get(npo_id);
  if (!npo) return { preview: null };

  const input = build_input(
    npo_id,
    npo.name,
    gross,
    nav.price,
    "preview",
    "preview",
    now,
    "cheque",
    {
      donor_email: "",
      donor_name: "",
      reference: "",
    }
  );

  const preview = await preview_settlement(input);
  return { preview };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const fd = await request.formData();
  const result = v.safeParse(schema, Object.fromEntries(fd));
  if (!result.success) {
    return { ok: false as const, error: "Invalid input" };
  }
  const parsed = result.output;

  const npo = await npo_get(parsed.npo_id);
  if (!npo) return { ok: false as const, error: "NPO not found" };

  const nav = await nav_ltd();
  const now = new Date().toISOString();

  const via = parsed.from; // "cheque" | "daf"
  const parent_id = crypto.randomUUID();
  const sttl_id = `${parsed.from}-${crypto.randomUUID()}`;

  const parent_don: IDonation = {
    id: parent_id,
    upusd: 1,
    status: "settled",
    created_at: now,
    updated_at: now,
    amount: { base: parsed.net, tip: 0, fee_allowance: 0 },
    currency: "USD",
    source: "bg-marketplace",
    frequency: "one-time",
    via,
    via_extra: parsed.reference,
    from_email: parsed.donor_email,
    from_name: parsed.donor_name,
    from_public: false,
    to_id: parsed.npo_id.toString(),
    to_name: npo.name,
    to_type: "npo",
    to_tip_allowed: npo.hide_bg_tip ?? false,
    to_members: [],
    settlement: {
      id: sttl_id,
      date: now,
      currency: "USD",
      net: parsed.net,
      fee: 0,
    },
  };

  const input = build_input(
    parsed.npo_id,
    npo.name,
    parsed.net,
    nav.price,
    sttl_id,
    parent_id,
    now,
    via,
    parsed
  );

  await db.transaction(async (tx) => {
    await donation_put(tx, parent_don);
    await settle_npo(tx, input);
  });

  return { ok: true as const };
};
