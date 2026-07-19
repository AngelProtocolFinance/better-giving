import { addMinutes } from "date-fns";
import type { IAmount } from "@/donations";
import { rd } from "@/helpers/decimal";
import { paypal as paypal_env } from "$/env";
import { paypal } from "$/kit/paypal";

export interface IInput extends IAmount {
  order_id: string;
  currency: string;
  freq: "monthly" | "weekly" | "annual";
}

const plans = {
  monthly: JSON.parse(paypal_env.plans.monthly) as Record<string, string>,
  weekly: JSON.parse(paypal_env.plans.weekly) as Record<string, string>,
  annual: JSON.parse(paypal_env.plans.annual) as Record<string, string>,
} as const;

export const create_subs = async (i: IInput): Promise<string> => {
  const total = i.base + i.tip + i.fee_allowance;
  const plan_id = plans[i.freq][i.currency];

  const { id = "invalid subs id" } = await paypal.create_subscription({
    custom_id: i.order_id,
    plan_id: plan_id,
    quantity: rd(total, 0),
    auto_renewal: true,
    start_time: addMinutes(new Date(), 5).toISOString(),
  });

  return id;
};
