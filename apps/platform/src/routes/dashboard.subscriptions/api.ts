import { user_ctx } from "#/.server/auth";
import type { ISub } from "@/subscriptions";
import { sub_user_list } from "$/pg/queries/subscription";
import type { Route } from "./+types/route";

export type ISubRow = Pick<
  ISub,
  | "id"
  | "to_npo_id"
  | "to_fund_id"
  | "to_name"
  | "currency"
  | "amount"
  | "amount_usd"
  | "interval"
  | "interval_count"
  | "status"
  | "next_billing"
  | "updated_at"
>;

export interface LoaderData {
  subs: ISubRow[];
}

export const loader = async ({ context }: Route.LoaderArgs) => {
  const user = context.get(user_ctx);
  const rows = await sub_user_list(user.email);
  const subs: ISubRow[] = rows.map((s) => ({
    id: s.id,
    to_npo_id: s.to_npo_id,
    to_fund_id: s.to_fund_id,
    to_name: s.to_name,
    currency: s.currency,
    amount: s.amount,
    amount_usd: s.amount_usd,
    interval: s.interval,
    interval_count: s.interval_count,
    status: s.status,
    next_billing: s.next_billing,
    updated_at: s.updated_at,
  }));
  return { subs } satisfies LoaderData;
};
