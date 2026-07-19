import { Client } from "@hubspot/api-client";
import { hubspot as hubspot_env } from "../env";

export const hubspot = new Client({
  accessToken: hubspot_env.access_token,
});
