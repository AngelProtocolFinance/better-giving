import type { ILossLog } from "@/revenue";
import { user_contact_by_id } from "$/pg/queries/user";

/** each write-off's `actor` as the admin's first name; the user id stays
 * where the user is unverified or banned, which the lookup skips */
export async function with_actor_names(logs: ILossLog[]): Promise<ILossLog[]> {
  const ids = [...new Set(logs.flatMap((l) => (l.actor ? [l.actor] : [])))];
  const names = new Map(
    await Promise.all(
      ids.map(
        async (id) =>
          [id, (await user_contact_by_id(id))?.first_name ?? id] as const
      )
    )
  );
  return logs.map((l) =>
    l.actor ? { ...l, actor: names.get(l.actor) ?? l.actor } : l
  );
}
