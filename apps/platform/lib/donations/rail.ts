/** the provider family a gift was paid through, from its `via` */
export type Rail = "stripe" | "paypal" | "crypto";

/** the rail `via` names, or null for one nothing refunds (daf, stocks, ...) */
export function rail_of(via: string): Rail | null {
  if (via.startsWith("stripe")) return "stripe";
  if (via.startsWith("paypal")) return "paypal";
  if (via.startsWith("crypto")) return "crypto";
  return null;
}
