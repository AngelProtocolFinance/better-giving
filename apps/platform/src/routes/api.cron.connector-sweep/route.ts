import type { ActionFunction } from "react-router";
import { sweep } from "$/connector/keys";
import { verify_qstash } from "$/kit/queue";
import { db } from "$/pg/db";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await sweep(db);
  return new Response("ok", { status: 200 });
};
