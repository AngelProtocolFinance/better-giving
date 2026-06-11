import { Client, Receiver } from "@upstash/qstash";
import type { IMsg } from "@/queue/types";
import { app, base_url, qstash, stage } from "../env";

export const receiver = new Receiver({
  currentSigningKey: qstash.current_signing_key,
  nextSigningKey: qstash.next_signing_key,
});

export const client = new Client({ token: qstash.token });

const donation_dist_q = client.queue({
  queueName: `${app.slug}-${stage}-don-dist-q`,
});
const q = client.queue({
  queueName: `${app.slug}-${stage}-q`,
});
export async function enqueue(...msgs: IMsg[]) {
  for (const m of msgs) {
    const res = await q.enqueueJSON({
      url: `${base_url}/api/q-handler/${m.id}`,
      body: m.payload,
      deduplicationId: m.dedupe,
      retries: 0,
    });
    console.info(`${m.dedupe}: ${res.messageId}`);
  }
}

export async function don_dist(
  destinations: { id: number; sttl: { id: string }; [k: string]: any }[]
) {
  for (const dest of destinations) {
    const res = await donation_dist_q.enqueueJSON({
      url: `${base_url}/api/q-don-dist/${dest.id}`,
      body: dest,
      deduplicationId: `${dest.sttl.id}_${dest.id}`,
      retries: 0,
    });
    console.info(`enqueue dist:${res.messageId}`);
  }
}

// throws Response(401) on failure
export async function verify_qstash(request: Request): Promise<string> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) throw new Response("missing signature", { status: 401 });

  const body = await request.text();

  const is_valid = await receiver.verify({
    body,
    signature,
    url: request.url,
  });

  if (!is_valid) throw new Response("invalid signature", { status: 401 });

  return body;
}
