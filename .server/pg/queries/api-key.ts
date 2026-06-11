import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { IApiKeyPayload } from "@/table/interfaces";
import { app } from "../../env";
import { db } from "../db";
import { api_keys } from "../schema/npo";

const encryption_key = Buffer.from(app.api_encryption_key, "base64");

export async function api_key_put(npo_id: number): Promise<string> {
  const payload: IApiKeyPayload = {
    npo_id,
    timestamp: Date.now(),
  };

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryption_key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const auth_tag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, encrypted, auth_tag]);
  const key = combined.toString("base64url");

  await db
    .insert(api_keys)
    .values({
      npo_id,
      api_key: key,
      created_at: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: api_keys.npo_id,
      set: { api_key: key, created_at: new Date().toISOString() },
    });

  return key;
}

export async function api_key_get(npo_id: number): Promise<string | undefined> {
  const [row] = await db
    .select()
    .from(api_keys)
    .where(eq(api_keys.npo_id, npo_id));
  return row?.api_key;
}

export function api_key_decode(key: string): IApiKeyPayload {
  const combined = Buffer.from(key, "base64url");

  const iv = combined.subarray(0, 12);
  const auth_tag = combined.subarray(combined.length - 16);
  const encrypted = combined.subarray(12, combined.length - 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", encryption_key, iv);
  decipher.setAuthTag(auth_tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  const raw = JSON.parse(decrypted.toString("utf8"));
  // normalize v1 (npoId+env) → v2 (npo_id, no env)
  return {
    npo_id: raw.npo_id ?? raw.npoId,
    timestamp: raw.timestamp,
  };
}
