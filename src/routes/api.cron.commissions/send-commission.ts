import { wise as wise_env } from "$/env";
import { wise } from "$/kit/wise";

export async function send_commission(
  to: number,
  amount: number,
  payout_id: string
) {
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

  // Initiating transfer
  const transfer = await wise.transfer({
    targetAccount: to.toString(),
    quoteUuid: quote.id,
    customerTransactionId: payout_id,
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
