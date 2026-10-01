import { createHash } from "node:crypto";
import { to_units } from "@/helpers/decimal";

/** a Wise payout failed with no money moved */
export class NotFundedError extends Error {
  constructor(cause: unknown) {
    super("transfer not funded", { cause });
    this.name = "NotFundedError";
  }
}

/**
 * what a payout run sends to Wise for these amounts: their sum in cents,
 * rounded half down. the minimum check, the ref, the quote and every record of
 * the payout take this one figure.
 */
export function payout_total(amounts: number[]): number {
  return (
    to_units(
      amounts.reduce((a, b) => a + b, 0),
      2,
      "half_down"
    ) / 100
  );
}

// fixed namespace for the uuid v5 below; changing it re-keys every ref
const REF_NAMESPACE = Buffer.from("cb853edef275466b85c79409fa3f037a", "hex");

/**
 * uuid v5 of recipient + total + claimed id set: wise's `customerTransactionId`
 * is its idempotency key, so only a retry of the same transfer to the same
 * account reuses it.
 */
export function transfer_ref(
  ref_key: string,
  total: number,
  ids: string[]
): string {
  const name = JSON.stringify([ref_key, total.toFixed(2), [...ids].sort()]);
  const b = createHash("sha1")
    .update(REF_NAMESPACE)
    .update(name)
    .digest()
    .subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
