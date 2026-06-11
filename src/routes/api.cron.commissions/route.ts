import type { ActionFunction } from "react-router";
import { verify_qstash } from "$/kit/queue";
import { index as commissions } from "./handler";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await commissions();
  return new Response("ok", { status: 200 });
};
