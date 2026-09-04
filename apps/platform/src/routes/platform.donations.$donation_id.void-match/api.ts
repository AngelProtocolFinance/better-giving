import { type InferOutput, picklist, safeParse } from "valibot";
import { dataWithError, dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { db } from "$/pg/db";
import { donation_get } from "$/pg/queries/donation";
import { match_event_get, void_match_event } from "$/pg/queries/match";
import type { Route } from "./+types/route";

const reason = picklist(["refunded", "refunded_loss"]);
export type VoidReason = InferOutput<typeof reason>;

export interface LoaderData {
  donation_id: string;
  /** donor-entered and never resolved — shown here only to identify the gift */
  company_name: string | null;
  voided_at: string | null;
  void_reason: VoidReason | null;
  status: string;
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const { donation_id } = params;

  const don = await donation_get(donation_id);
  if (!don) throw new Response("donation not found", { status: 404 });

  const event = await match_event_get(donation_id);
  // the void link renders only where an event exists, so a url without one is
  // not a form to fill — it is a page that is not there
  if (!event) throw new Response("no match event", { status: 404 });

  return {
    donation_id,
    company_name: don.from_company_name ?? null,
    voided_at: event.voided_at,
    void_reason: event.void_reason,
    status: don.status,
  } satisfies LoaderData;
};

export const action = async ({ request, params }: Route.ActionArgs) => {
  const { donation_id } = params;

  const fv = await request.formData();
  const p = safeParse(reason, fv.get("reason"));
  if (p.issues) return resp.fail(400, "invalid void reason");

  const row = await void_match_event(db, donation_id, p.output);
  // the loader 404s where no event exists, so a null here is the earlier void
  // refused by the query's gate; a direct POST against a donation with no event
  // reads the same to the admin
  if (!row) return dataWithError({ ok: false }, "Match already voided");

  return dataWithSuccess({ ok: true }, "Match voided");
};
