import { report_error } from "@/errors/report";
import { anvil, base_url } from "$/env";
import type { Route } from "./+types/route";
import { etch_complete } from "./etch-complete";
import type { WebhookPayload } from "./types";

/** don't return 4xx status, to prevent retries */
export async function action({ request }: Route.ActionArgs) {
  try {
    const body = await request.text();
    const p: WebhookPayload = JSON.parse(body || "{}");
    if (p.token !== anvil.webhook_token) {
      return new Response("invalid token", { status: 200 });
    }

    if (p.action === "etchPacketComplete") {
      const signed = await etch_complete(p.data, base_url);
      return new Response(signed || "no doc url", { status: 200 });
    }

    return new Response("no action taken", { status: 200 });
  } catch (err) {
    report_error(err);
    return new Response("error", { status: 206 });
  }
}
