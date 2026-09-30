import { addMinutes } from "date-fns";
import { paypal as paypal_env } from "$/env";
import { paypal } from "$/kit/paypal";
import type { ICharge } from "./charge";

type TFreq = "monthly" | "weekly" | "annual";

export interface IInput {
  order_id: string;
  currency: string;
  freq: TFreq;
  charge: ICharge;
}

// read per call: this module loads with every donation rail, so a bad plan
// var must fail its own frequency, not the import
const plan_id_of = (freq: TFreq, currency: string): string => {
  const raw = paypal_env.plans[freq];
  const id = raw
    ? (JSON.parse(raw) as Record<string, string>)[currency]
    : undefined;
  if (!id) throw new Error(`no paypal ${freq} plan for ${currency}`);
  return id;
};

export const create_subs = async (i: IInput): Promise<string> => {
  const plan_id = plan_id_of(i.freq, i.currency);

  // order_id is stable per intent — use it as the idempotency key so a retry
  // after a timeout returns the original subscription instead of a duplicate
  const { id = "invalid subs id" } = await paypal.create_subscription(
    {
      custom_id: i.order_id,
      plan_id: plan_id,
      // each plan prices one unit of its currency, so the quantity is the
      // per-cycle total; paypal's quantity takes decimals
      quantity: i.charge.total,
      auto_renewal: true,
      start_time: addMinutes(new Date(), 5).toISOString(),
    },
    `subs-${i.order_id}`
  );

  return id;
};
