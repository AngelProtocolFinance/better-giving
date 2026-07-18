import { PayPalSDK } from "@better-giving/paypal";
import { paypal as paypal_env } from "../env";

export const paypal = new PayPalSDK({
  client_id: paypal_env.client_id,
  client_secret: paypal_env.client_secret,
  api_url: paypal_env.api_url,
});
