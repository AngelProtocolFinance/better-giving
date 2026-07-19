import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { webhooks } from "../schema/npo";

type Webhook = typeof webhooks.$inferSelect;

export async function save_webhook(
  url: string,
  npo_id: number
): Promise<string> {
  const id = globalThis.crypto.randomUUID();
  await db.insert(webhooks).values({ id, npo_id, url });
  return id;
}

export async function delete_webhook(id: string, npo_id: number) {
  await db
    .delete(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.npo_id, npo_id)));
}

export async function query_webhooks(npo_id: number): Promise<Webhook[]> {
  return db.select().from(webhooks).where(eq(webhooks.npo_id, npo_id));
}
