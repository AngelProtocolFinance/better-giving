import type { ILossLog } from "@/revenue";
import { user_names_by_ids } from "$/pg/queries/user";

/** each write-off's `actor` as the admin's name; the user id stays where no
 * user has it */
export async function with_actor_names(logs: ILossLog[]): Promise<ILossLog[]> {
  const ids = [...new Set(logs.flatMap((l) => (l.actor ? [l.actor] : [])))];
  const names = await user_names_by_ids(ids);
  return logs.map((l) =>
    l.actor ? { ...l, actor: names.get(l.actor) ?? l.actor } : l
  );
}
