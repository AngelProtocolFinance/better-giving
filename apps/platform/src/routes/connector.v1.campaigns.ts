import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { open_key } from "$/connector/http";
import { list_campaigns } from "$/connector/reads";
import { create_campaign } from "$/connector/writes";
import { db } from "$/pg/db";

export async function loader({ request }: LoaderFunctionArgs) {
  const live = await open_key(db, request);
  if (live instanceof Response) return live;
  return list_campaigns(db, live.npo_id, new URL(request.url));
}

export function action({ request }: ActionFunctionArgs) {
  return create_campaign(db, request);
}
