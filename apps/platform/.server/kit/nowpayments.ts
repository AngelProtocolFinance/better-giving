import { Nowpayments } from "@/nowpayments";
import { nowpayments } from "../env";

export const np = new Nowpayments({
  apiToken: nowpayments.api_key,
  baseUrl: nowpayments.api_url,
});
