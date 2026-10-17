import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import type { DbOrTx } from "../pg/queries/helpers";
import { connector_idempotency } from "../pg/schema/connector";
import { problem } from "./problem";

/** Same window `sweep` deletes in keys.ts. A replay inside it is 200. */
const IDEM_MS = 24 * 60 * 60 * 1000;
const MAX_KEY_LEN = 255;

const sha256_hex = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

/**
 * One logical write per `(key_id, Idempotency-Key)`. The handler runs only
 * when this call owns a fresh `pending` row. A throw deletes that row so the
 * key is not stuck in flight.
 */
export async function with_idempotency(
  db: DbOrTx,
  key_id: string,
  request: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  const idem_key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!idem_key || idem_key.length > MAX_KEY_LEN) {
    return problem(400, "idempotency_key_required");
  }

  const raw = await request.clone().text();
  const request_hash = sha256_hex(raw);

  // a lost race re-reads; a comparison that never deletes must not spin
  for (let spins = 0; spins < 4; spins++) {
    const inserted = await db
      .insert(connector_idempotency)
      .values({
        key_id,
        idem_key,
        request_hash,
        status: "pending",
      })
      .onConflictDoNothing()
      .returning({ idem_key: connector_idempotency.idem_key });

    if (inserted.length === 1) return finish(db, key_id, idem_key, handler);

    const [row] = await db
      .select()
      .from(connector_idempotency)
      .where(
        and(
          eq(connector_idempotency.key_id, key_id),
          eq(connector_idempotency.idem_key, idem_key)
        )
      );
    if (!row) continue;
    if (row.status === "pending") return problem(409, "idempotency_conflict");

    const created_ms = Date.parse(row.created_at);
    if (Number.isNaN(created_ms) || created_ms + IDEM_MS < Date.now()) {
      await db
        .delete(connector_idempotency)
        .where(
          and(
            eq(connector_idempotency.key_id, key_id),
            eq(connector_idempotency.idem_key, idem_key),
            lt(
              connector_idempotency.created_at,
              new Date(Date.now() - IDEM_MS).toISOString()
            )
          )
        );
      continue;
    }

    if (row.request_hash !== request_hash) {
      return problem(409, "idempotency_conflict");
    }

    // replay is 200 even when the row stored a 201
    return Response.json(row.response_body, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }

  return problem(409, "idempotency_conflict");
}

async function finish(
  db: DbOrTx,
  key_id: string,
  idem_key: string,
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    const res = await handler();
    const text = await res.text();
    const response_body: unknown = JSON.parse(text);
    await db
      .update(connector_idempotency)
      .set({
        status: "stored",
        response_status: res.status,
        response_body,
      })
      .where(
        and(
          eq(connector_idempotency.key_id, key_id),
          eq(connector_idempotency.idem_key, idem_key)
        )
      );
    const headers = new Headers(res.headers);
    headers.set("cache-control", "no-store");
    return new Response(text, { status: res.status, headers });
  } catch (err) {
    await db
      .delete(connector_idempotency)
      .where(
        and(
          eq(connector_idempotency.key_id, key_id),
          eq(connector_idempotency.idem_key, idem_key),
          eq(connector_idempotency.status, "pending")
        )
      );
    throw err;
  }
}
