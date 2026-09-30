import { resp } from "@/helpers/https";
import type { IApiKeyPayload } from "@/table/interfaces";
import { api_key_decode, api_key_get } from "$/pg/queries/api-key";

/**
 * every credential failure is 401: zapier reads only that as "reconnect"
 * @param api_key - from header
 */
export async function validate_api_key(
  api_key: string | null
): Promise<IApiKeyPayload | Response> {
  //no api key in header
  if (!api_key) return resp.status(401);
  const payload = api_key_decode(api_key);
  if (!payload) return resp.status(401);

  // only the npo's current key is live: a rotated-out one decodes fine
  const current = await api_key_get(payload.npo_id);
  if (current !== api_key) return resp.status(401);
  return payload;
}

export const is_response = (x: any): x is Response => x instanceof Response;
