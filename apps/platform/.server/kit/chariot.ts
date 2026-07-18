import { Chariot } from "@better-giving/chariot";
import { chariot as chariot_env } from "../env";

export const chariot = new Chariot({
  api_key: chariot_env.api_key,
  api_url: chariot_env.api_url,
});
