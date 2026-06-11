import type { ActionFunction } from "react-router";
import { verify_qstash } from "$/kit/queue";
import { index as savings_snapshot } from "./handler";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await savings_snapshot();
  return new Response("ok", { status: 200 });
};
