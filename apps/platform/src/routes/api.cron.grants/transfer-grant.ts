import { wise as wise_env } from "$/env";
import { wise } from "$/kit/wise";
import { NotFundedError } from "$/payouts/settle";

export async function transfer_grant(to: number, amount: number, ref: string) {
  const transfer_id = await create_transfer(to, amount, ref).catch((err) => {
    throw new NotFundedError(err);
  });

  const funding = await wise.fund_transfer(transfer_id, +wise_env.profile_id, {
    type: "BALANCE",
  });

  if (funding.status === "REJECTED") {
    throw new NotFundedError(new Error(`funding failed ${funding.errorCode}`));
  }
  return transfer_id;
}

async function create_transfer(to: number, amount: number, ref: string) {
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
  return transfer.id;
}
