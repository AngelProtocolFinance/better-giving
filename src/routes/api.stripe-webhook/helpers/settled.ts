import { stripe } from "$/kit/stripe";

/** in usd */
interface Settled {
  net: number;
  fee: number;
}

// thrown when stripe hasn't populated balance_transaction yet (typical for
// fx-converted charges). route.ts maps this to 503 so stripe redelivers the
// event on its own retry schedule.
export class BalanceTxnNotReadyError extends Error {
  constructor(id: string) {
    super(`balance_transaction not ready for payment intent: ${id}`);
    this.name = "BalanceTxnNotReadyError";
  }
}

export async function settled_fn(id: string): Promise<Settled> {
  const { latest_charge: lc } = await stripe.paymentIntents.retrieve(id, {
    expand: ["latest_charge.balance_transaction"],
  });

  if (
    lc &&
    typeof lc !== "string" &&
    lc.balance_transaction &&
    typeof lc.balance_transaction !== "string"
  ) {
    const { net, fee } = lc.balance_transaction;
    return { net: net / 100, fee: fee / 100 };
  }

  throw new BalanceTxnNotReadyError(id);
}
