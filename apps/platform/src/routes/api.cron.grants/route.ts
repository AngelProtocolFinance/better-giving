import type { ActionFunction } from "react-router";
import { base_url, stage } from "$/env";
import { client, verify_qstash } from "$/kit/queue";
import { index as grants_notif } from "./notif";

export const action: ActionFunction = async ({ request }) => {
  await verify_qstash(request);
  await grants_notif();

  const tick_utc_day = new Date().toISOString().slice(0, 10);
  // schedule execute 24h later
  await client.publishJSON({
    url: `${base_url}/api/cron/grants-execute`,
    delay: 86400,
    // collapses duplicate deliveries of one tick inside qstash's dedup window;
    // a redelivery after it still publishes, and execute's pending → processing
    // claim is what makes that second run pay nothing.
    // stage-scoped: both stages share one qstash account.
    deduplicationId: `grants.execute_${stage}_${tick_utc_day}`,
  });

  return new Response("ok", { status: 200 });
};
