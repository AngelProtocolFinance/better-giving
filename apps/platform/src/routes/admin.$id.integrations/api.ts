import { safeParse } from "valibot";
import { admin_ctx, user_ctx } from "#/.server/auth";
import { dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { list_live_keys, revoke_key } from "$/connector/keys";
import { db } from "$/pg/db";
import { api_key_get, api_key_put } from "$/pg/queries/api-key";
import type { Route } from "./+types/route";

const posted_revoke_key = async (request: Request | undefined) => {
  if (!request) return null;
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw resp.status(400, "Invalid JSON");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw resp.status(400, "Invalid revocation request");
  }
  const id = (body as { revoke_key?: unknown }).revoke_key;
  if (typeof id !== "string") {
    throw resp.status(400, "Invalid revocation request");
  }
  return id;
};

export const action = async ({
  request,
  params,
  context,
}: Route.ActionArgs) => {
  const revoke_id = await posted_revoke_key(request);
  if (revoke_id !== null) {
    // a key that is not this npo's matches nothing and stays live
    await revoke_key(db, {
      id: revoke_id,
      npo_id: context.get(admin_ctx),
      revoked_by: context.get(user_ctx).id,
    });
    return dataWithSuccess(null, "Connection revoked");
  }

  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const key = await api_key_put(p.output);
  // the new key deletes every stored hook, and zapier never learns a rest hook is gone
  return dataWithSuccess(
    { apiKey: key },
    "API key generated. Your existing Zaps stop working until you reconnect Zapier with the new key and turn each Zap off and on."
  );
};

export interface LoaderData {
  apiKey: string | undefined;
  connections: Awaited<ReturnType<typeof list_live_keys>>;
}

export const loader = async ({ params, context }: Route.LoaderArgs) => {
  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const key = await api_key_get(p.output);
  const connections = await list_live_keys(db, context.get(admin_ctx));
  return { apiKey: key, connections };
};
