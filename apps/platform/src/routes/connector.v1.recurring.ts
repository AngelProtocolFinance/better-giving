import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { open_key } from "$/connector/http";
import { problem } from "$/connector/problem";
import { list_recurring } from "$/connector/reads";
import { db } from "$/pg/db";

export async function loader({ request }: LoaderFunctionArgs) {
  const live = await open_key(db, request);
  if (live instanceof Response) return live;
  return list_recurring(db, live.npo_id, new URL(request.url));
}

export function action(_args: ActionFunctionArgs) {
  return problem(404, "unknown_action");
}
