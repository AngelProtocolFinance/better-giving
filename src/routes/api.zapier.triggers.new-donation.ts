import type { ActionFunction, LoaderFunction } from "react-router";
import { via_name } from "@/donations/helpers";
import { npo_donations } from "$/pg/queries/dist";
import { delete_webhook, save_webhook } from "$/pg/queries/webhook";
import { is_response, validate_api_key } from "./_helpers/validate-api-key";

interface Item {
  id: string;
  date: string;
  recipient_id: number;
  recipient_name: string;
  amount: number;
  amount_usd: number;
  currency: string;
  donor_name: string;
  donor_email: string;
  program_id?: string;
  program_name?: string;
  payment_method: string;
  is_recurring: boolean;
  donor_company?: string;
}

//get all recent donations
export const loader: LoaderFunction = async ({ request }) => {
  const result = await validate_api_key(request.headers.get("x-api-key"));
  if (is_response(result)) return result;
  const page1 = await npo_donations(result.npo_id, { limit: 3 });
  const items = page1.items.map((i) => {
    const x: Item = {
      id: i.id,
      date: i.date_created,
      recipient_id: i.to_id ?? 0,
      recipient_name: i.to_name ?? "",
      amount: i.amount ?? 0,
      amount_usd: i.amount_usd ?? 0,
      currency: i.amount_denom,
      donor_name: i.from_name ?? "",
      donor_email: i.from_email,
      program_id: i.program_id ?? undefined,
      program_name: i.program_name ?? undefined,
      payment_method: via_name(i.via),
      is_recurring: i.frequency !== "one-time",
      donor_company: i.from_company ?? undefined,
    };
    return x;
  });
  return new Response(JSON.stringify(items), { status: 200 });
};

export const action: ActionFunction = async ({ request }) => {
  const result = await validate_api_key(request.headers.get("x-api-key"));
  if (is_response(result)) return result;

  const data = await request.json();

  //subscribe
  if (request.method === "POST") {
    const id = await save_webhook(data.hookUrl, result.npo_id);
    return new Response(JSON.stringify({ id }), { status: 200 });
  }

  //unsubscribe
  if (request.method === "DELETE") {
    await delete_webhook(data.id, result.npo_id);
    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 405 });
};
