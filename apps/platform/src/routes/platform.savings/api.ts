import type { IBalLog, IInterestLogDb } from "@/liquid";
import { bal_log_list, intr_log_list } from "$/pg/queries/liquid";
import type { Route } from "./+types/route";

export interface LoaderData {
  logs_bal: IBalLog[];
  logs_bal_next?: string;
  logs_intr: IInterestLogDb[];
  logs_intr_next?: string;
}

export const loader = async (_: Route.LoaderArgs) => {
  const [bal, intr] = await Promise.all([
    bal_log_list({ limit: 3 }),
    intr_log_list({ limit: 3 }),
  ]);

  return {
    logs_bal: bal.items,
    logs_bal_next: bal.next,
    logs_intr: intr.items,
    logs_intr_next: intr.next,
  } satisfies LoaderData;
};
