import type { ActionFunction } from "react-router";
import { verify_qstash } from "$/kit/queue";
import { index as grants_execute } from "../api.cron.grants/handler";

// read statically by vercelPreset, so literals only. 800s is the pro + fluid
// ceiling.
export const config = { maxDuration: 800 };

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  const run = await grants_execute();
  return new Response(run.body, { status: run.statusCode });
};
