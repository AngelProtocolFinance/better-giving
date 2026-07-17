import type { ActionFunction } from "react-router";
import { verify_qstash } from "$/kit/queue";
import { index as grants_execute } from "../api.cron.grants/handler";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await grants_execute();
  return new Response("ok", { status: 200 });
};
