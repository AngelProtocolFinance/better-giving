import type { IRevenueLog, IRevenueLtd } from "@/revenue";
import { npos_batch_get } from "$/pg/queries/npo";
import { rev_log_list, rev_ltd_get } from "$/pg/queries/revenue";
import type { Route } from "./+types/route";

export interface NpoLtd {
  id: number;
  name: string;
  tip: number;
  base_fee: number;
  fsa_fee: number;
}

export interface LoaderData {
  ltd: IRevenueLtd | undefined;
  logs: IRevenueLog[];
  logs_next?: string;
  npo_ltds: NpoLtd[];
}

export const loader = async (_: Route.LoaderArgs) => {
  const [ltd, logs_page] = await Promise.all([
    rev_ltd_get(),
    rev_log_list({ limit: 5 }),
  ]);

  // extract per-npo breakdowns from flat keys: "#123.tip" → { tip: N, ... }
  const npo_map = new Map<
    number,
    { tip: number; base_fee: number; fsa_fee: number }
  >();
  if (ltd) {
    for (const [k, v] of Object.entries(ltd)) {
      const m = k.match(/^#(\d+)\.(.+)$/);
      if (!m || typeof v !== "number") continue;
      const id = Number(m[1]);
      if (!npo_map.has(id))
        npo_map.set(id, { tip: 0, base_fee: 0, fsa_fee: 0 });
      const entry = npo_map.get(id)!;
      const field = m[2] as keyof typeof entry;
      if (field in entry) entry[field] = v;
    }
  }
  const npo_ids = [...npo_map.keys()];

  const npos = await npos_batch_get(npo_ids);
  const npo_ltds: NpoLtd[] = npos
    .map((n) => {
      const d = npo_map.get(n.id)!;
      return { id: n.id, name: n.name, ...d };
    })
    .sort((a, b) => {
      const total_b = b.tip + b.base_fee + b.fsa_fee;
      const total_a = a.tip + a.base_fee + a.fsa_fee;
      return total_b - total_a;
    });

  return {
    ltd,
    logs: logs_page.items,
    logs_next: logs_page.next,
    npo_ltds,
  } satisfies LoaderData;
};
