import { Client, Receiver, SignatureError } from "@upstash/qstash";
import type { IMsg } from "@/queue/types";
import { app, base_url, qstash, stage } from "../env";

export const receiver = new Receiver({
  currentSigningKey: qstash.current_signing_key,
  nextSigningKey: qstash.next_signing_key,
});

export const client = new Client({ token: qstash.token });

/** how long qstash drops a message whose `deduplicationId` it has already
 * seen — on enqueue and publish alike. past it the same id sends again. */
export const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

/** whether a message keyed on a write stamped at `at` would still be dropped
 * as a repeat. the enqueue follows the write, so this closes a little before
 * qstash's own window does. */
export const in_dedupe_window = (at: string | null, now = Date.now()) =>
  at != null && now - Date.parse(at) < DEDUPE_WINDOW_MS;

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
      // a kind that declares no delivery config is at-most-once
      retries: m.retries ?? 0,
    });
    console.info(`${m.dedupe}: ${res.messageId}`);
  }
}

/**
 * a message that fires later, delivered on its own rather than through the queue.
 *
 * published, not enqueued: the shared queue is FIFO and delivers one message at
 * a time, waiting for each to succeed or fail before starting the next, so a
 * message parked at its head for days stalls every notification behind it —
 * which is why qstash documents `delay` on publish and not on enqueue. these
 * have no ordering relationship to anything anyway: each is a standalone timer
 * against one db row, and the handler re-reads that row at fire time rather
 * than trusting the payload.
 *
 * qstash's dedupe window (`DEDUPE_WINDOW_MS`) is far shorter than the delays
 * here, so `dedupe` does not protect the far end. a scheduled kind's handler
 * owns its own send-once gate.
 */
export async function schedule(...msgs: IMsg[]) {
  for (const m of msgs) {
    const res = await client.publishJSON({
      url: `${base_url}/api/q-handler/${m.id}`,
      body: m.payload,
      deduplicationId: m.dedupe,
      retries: m.retries ?? 0,
      delay: m.delay_s,
    });
    console.info(`${m.dedupe}: scheduled ${res.messageId} in ${m.delay_s}s`);
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

  // verify throws SignatureError on a bad signature rather than returning false;
  // any other throw (no signing keys) is ours and stays a 500
  await receiver
    .verify({ body, signature, url: request.url })
    .catch((err: unknown) => {
      if (err instanceof SignatureError) {
        throw new Response("invalid signature", { status: 401 });
      }
      throw err;
    });

  return body;
}
