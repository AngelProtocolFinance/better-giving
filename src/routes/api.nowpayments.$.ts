import type { LoaderFunction } from "react-router";
import { resp } from "@/helpers/https";
import { nowpayments } from "$/env";

export const loader: LoaderFunction = async ({ request, params }) => {
  const from = new URL(request.url);
  const to = new URL(nowpayments.api_url);
  to.pathname = params["*"]!;
  to.search = from.searchParams.toString();

  const res = await fetch(to, {
    headers: { "x-api-key": nowpayments.api_key },
  });
  const json = await res.json();
  return resp.json(json, res.status);
};
