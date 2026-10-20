import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { open_key } from "$/connector/http";
import { list_donations } from "$/connector/reads";
import { record_donation } from "$/connector/writes";
import { db } from "$/pg/db";

export async function loader({ request }: LoaderFunctionArgs) {
  const live = await open_key(db, request);
  if (live instanceof Response) return live;
  return list_donations(db, live.npo_id, new URL(request.url));
}

export function action({ request }: ActionFunctionArgs) {
  return record_donation(db, request);
}
