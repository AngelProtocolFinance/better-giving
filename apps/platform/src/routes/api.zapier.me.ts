import type { LoaderFunctionArgs } from "react-router";
import { is_response, validate_api_key } from "./_helpers/validate-api-key";

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await validate_api_key(request.headers.get("x-api-key"));
  if (is_response(result)) return result;
  //data for connection label — preserve npoId key for zapier client compat
  const { npo_id, ...rest } = result;
  return new Response(JSON.stringify({ npoId: npo_id, ...rest }), {
    status: 200,
  });
}
