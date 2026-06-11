import { resp } from "@/helpers/https";
import { type FormRow, form_get } from "$/pg/queries/form";
import { npo_get } from "$/pg/queries/npo";
import type { Route } from "./+types/route";

export const headers: Route.HeadersFunction = () => ({
  "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
});

export interface IRecipient {
  name: string;
  hide_bg_tip?: boolean;
  donor_address_required?: boolean;
}

export interface ILoader extends FormRow {
  recipient_details: IRecipient;
  base_url: string;
}

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const form = await form_get(params.id);
  if (!form) throw resp.err(404, "form not found");

  const x = await npo_get(form.recipient_npo_id ?? 0);
  if (!x) throw resp.err(404, "recipient not found");

  return {
    ...form,
    recipient_details: x,
    base_url: new URL(request.url).origin,
  } satisfies ILoader;
};
