import type { ActionFunction } from "react-router";
import { base_url } from "$/env";
import { client, verify_qstash } from "$/kit/queue";
import { index as grants_notif } from "./notif";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await grants_notif();

  // schedule execute 24h later
  await client.publishJSON({
    url: `${base_url}/api/cron/grants-execute`,
    delay: 86400,
  });

  return new Response("ok", { status: 200 });
};
