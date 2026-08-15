import { Wise } from "@/wise";
import { wise as wise_env } from "../env";

export const wise = new Wise({
  apiToken: wise_env.api_token,
  base_url: wise_env.api_url,
});
