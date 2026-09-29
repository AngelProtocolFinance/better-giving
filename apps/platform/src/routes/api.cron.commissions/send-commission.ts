import { createHash } from "node:crypto";
import { wise as wise_env } from "$/env";
import { wise } from "$/kit/wise";

// fixed prefix for the uuid v5 below; changing it re-keys every pending set
const REF_NS = "better.giving/referrer-commission/";

/**
 * wise's `customerTransactionId` (its idempotency key, uuid-shaped) for a
 * commission set: a uuid v5 of the sorted donation ids, so a retry or a later
 * run over the same still-pending set gets the original transfer back instead
 * of paying it again.
 */
export function commission_ref(donation_ids: string[]): string {
  const b = createHash("sha1")
    .update(REF_NS + JSON.stringify([...donation_ids].sort()))
    .digest()
    .subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function send_commission(to: number, amount: number, ref: string) {
  const recipient = await wise.v2_account(to);

  const quote = await wise.quote(wise_env.profile_id, {
    sourceCurrency: "USD",
    targetCurrency: recipient.currency,
    sourceAmount: amount,
    targetAmount: null,
    payOut: null,
    preferredPayIn: null,
    targetAccount: to.toString(),
  });

  // initiating transfer
  const transfer = await wise.transfer({
    targetAccount: to.toString(),
    quoteUuid: quote.id,
    customerTransactionId: ref,
    details: {
      transferPurpose: "verification.transfers.purpose.other",
      sourceOfFunds: "verification.source.of.funds.other",
    },
  });

  if (transfer.errors) throw transfer.errors;

  const funding = await wise.fund_transfer(transfer.id, +wise_env.profile_id, {
    type: "BALANCE",
  });

  if (funding.status === "REJECTED") {
    throw new Error(`funding failed ${funding.errorCode}`);
  }
  return transfer.id;
}
