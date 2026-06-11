import { Wise } from "@/wise";
import { stage, wise as wise_env } from "../env";

export const wise = new Wise({
  apiToken: wise_env.api_token,
  sandbox: stage === "staging",
});
