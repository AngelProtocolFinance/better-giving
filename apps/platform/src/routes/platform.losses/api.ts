import type { ILossLog, ILossLtd } from "@/revenue";
import { npos_batch_get } from "$/pg/queries/npo";
import { loss_log_list, loss_ltd_get } from "$/pg/queries/revenue";
import type { Route } from "./+types/route";

export interface NpoLoss {
  id: number;
  name: string;
  amount: number;
}

export interface LoaderData {
  ltd: ILossLtd | undefined;
  logs: ILossLog[];
  logs_next?: string;
  npo_losses: NpoLoss[];
}

export const loader = async (_: Route.LoaderArgs) => {
  const [ltd, logs_page] = await Promise.all([
    loss_ltd_get(),
    loss_log_list({ limit: 20 }),
  ]);

  // extract per-npo breakdowns from flat keys: "#123" → amount
  const npo_map = new Map<number, number>();
  if (ltd) {
    for (const [k, v] of Object.entries(ltd)) {
      const m = k.match(/^#(\d+)$/);
      if (!m || typeof v !== "number") continue;
      npo_map.set(Number(m[1]), v);
    }
  }
  const npo_ids = [...npo_map.keys()];

  const npos = npo_ids.length > 0 ? await npos_batch_get(npo_ids) : [];

  const npo_losses: NpoLoss[] = npos
    .map((n) => ({
      id: n.id,
      name: n.name,
      amount: npo_map.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    ltd,
    logs: logs_page.items,
    logs_next: logs_page.next,
    npo_losses,
  } satisfies LoaderData;
};
