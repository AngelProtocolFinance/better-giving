import type { ActionFunction, LoaderFunction } from "react-router";
import * as v from "valibot";
import { resp } from "@/helpers/https";
import type { TFrequency } from "@/schemas";
import { is_zapier_hook_url } from "@/zapier/hook-url";
import { new_donation_item } from "@/zapier/new-donation";
import { npo_donations } from "$/pg/queries/dist";
import { delete_webhook, save_webhook } from "$/pg/queries/webhook";
import { is_response, validate_api_key } from "./_helpers/validate-api-key";

//get all recent donations
export const loader: LoaderFunction = async ({ request }) => {
  const result = await validate_api_key(request.headers.get("x-api-key"));
  if (is_response(result)) return result;
  const page1 = await npo_donations(result.npo_id, { limit: 3 });
  const items = page1.items.map((i) =>
    new_donation_item({
      id: i.id,
      date: i.date_created,
      // the list is filtered on to_id, so it is never null here
      to_id: i.to_id ?? result.npo_id,
      to_name: i.to_name ?? "",
      amount: i.amount ?? 0,
      amount_usd: i.amount_usd ?? 0,
      currency: i.amount_denom,
      // the column is untyped text, written only from a TFrequency
      frequency: i.frequency as TFrequency,
      via: i.via,
      from_email: i.from_email,
      from_name: i.from_name,
      from_company: i.from_company,
      program_id: i.program_id,
      program_name: i.program_name,
      form_id: i.form_id,
      form_tag: i.form_tag,
    })
  );
  return new Response(JSON.stringify(items), { status: 200 });
};

const unsubscribe = v.object({ id: v.pipe(v.string(), v.nonEmpty()) });

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return new Response(null, {
      status: 405,
      headers: { allow: "POST, DELETE" },
    });
  }
  const result = await validate_api_key(request.headers.get("x-api-key"));
  if (is_response(result)) return result;

  const data = await request.json().catch(() => null);
  if (!data) return resp.status(400, "invalid json body");

  //subscribe
  if (request.method === "POST") {
    if (!is_zapier_hook_url(data.hookUrl)) {
      return resp.status(
        400,
        "hookUrl must be a https://hooks.zapier.com/ url"
      );
    }
    const id = await save_webhook(data.hookUrl, result.npo_id);
    return new Response(JSON.stringify({ id }), { status: 200 });
  }

  //unsubscribe
  const p = v.safeParse(unsubscribe, data);
  if (p.issues) return resp.status(400, "id must be a hook id");
  await delete_webhook(p.output.id, result.npo_id);
  return new Response(null, { status: 200 });
};
