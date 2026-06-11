import type { ActionFunction } from "react-router";
import { verify_qstash } from "$/kit/queue";
import { handle_npo } from "./npo";

export const action: ActionFunction = async ({ request }) => {
  const raw = await verify_qstash(request);
  const payload = JSON.parse(raw);
  await handle_npo(payload);
  return new Response("ok", { status: 200 });
};
