import { resp } from "@/helpers/https";
import type { IApiKeyPayload } from "@/table/interfaces";
import { api_key_decode, api_key_get } from "$/pg/queries/api-key";

/**@param api_key - from header */
export async function validate_api_key(
  api_key: string | null
): Promise<IApiKeyPayload | Response> {
  //no api key in header
  if (!api_key) return resp.status(400);
  const payload = api_key_decode(api_key);

  //npo_id indeed has api key saved/active
  const retrieved = await api_key_get(payload.npo_id);
  if (!retrieved) return resp.status(404);

  // api key used in this request is the same as the one saved/active
  if (retrieved !== api_key) return resp.status(401);
  return payload;
}

export const is_response = (x: any): x is Response => x instanceof Response;
