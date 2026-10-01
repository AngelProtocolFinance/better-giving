import { safeParse } from "valibot";
import { dataWithSuccess } from "#/.server/toast";
import { resp } from "@/helpers/https";
import { $int_gte1 } from "@/schemas";
import { api_key_get, api_key_put } from "$/pg/queries/api-key";
import type { Route } from "./+types/route";

export const action = async ({ params }: Route.ActionArgs) => {
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
}

export const loader = async ({ params }: Route.LoaderArgs) => {
  const p = safeParse($int_gte1, params.id);
  if (p.issues) throw resp.status(400, p.issues[0].message);
  const key = await api_key_get(p.output);
  return { apiKey: key };
};
