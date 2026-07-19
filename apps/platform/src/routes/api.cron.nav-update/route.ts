import type { ActionFunction } from "react-router";
import { verify_qstash } from "$/kit/queue";
import { index as nav_update } from "./handler";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await nav_update();
  return new Response("ok", { status: 200 });
};
