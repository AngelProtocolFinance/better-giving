import { wise as wise_env } from "../env";
import { wise } from "../kit/wise";
import { NotFundedError } from "./transfer";

/** awaiting our funding: the one status in which funding it is ours to ask */
const UNFUNDED = "incoming_payment_waiting";
/** funded, and the money on its way or delivered */
const FUNDED = new Set([
  "incoming_payment_initiated",
  "processing",
  "funds_converted",
  "outgoing_payment_sent",
]);

/**
 * pays `amount` USD to wise recipient `to` under `ref`, wise's idempotency key:
 * quote → transfer → fund. resolves with the transfer id once funding was
 * accepted, or at once when the ref's transfer was already funded by an
 * earlier attempt under the same claim. throws `NotFundedError` only when no money moved; any other
 * throw means it may have.
 */
export async function wise_pay(
  to: number,
  amount: number,
  ref: string
): Promise<number> {
  const transfer = await create_transfer(to, amount, ref).catch((err) => {
    throw new NotFundedError(err);
  });

  // a reused ref returns the original transfer, which an earlier run may have funded
  if (FUNDED.has(transfer.status ?? "")) return transfer.id;
  if (transfer.status === "cancelled") {
    // wise cancels a transfer left unfunded; cancelled before funding, no money moved
    throw new NotFundedError(
      new Error(
        `transfer ${transfer.id} (customerTransactionId ${ref}) is cancelled`
      )
    );
  }
  if (transfer.status !== UNFUNDED) {
    // refunded, bounced, charged back or unrecognised: money may have moved
    throw new Error(
      `transfer ${transfer.id} (customerTransactionId ${ref}) is ${transfer.status}`
    );
  }

  const funding = await wise.fund_transfer(transfer.id, +wise_env.profile_id, {
    type: "BALANCE",
  });

  if (funding.status === "REJECTED") {
    throw new NotFundedError(new Error(`funding failed ${funding.errorCode}`));
  }
  return transfer.id;
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
  return transfer;
}
