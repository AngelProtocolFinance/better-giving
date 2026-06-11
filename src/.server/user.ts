import type { INpoBookmark, IUserNpo2 } from "#/types/user";
import { npos_batch_get } from "$/pg/queries/npo";
import {
  user_bookmarks_list as get_bookmarks,
  user_npos as get_npos,
} from "$/pg/queries/user";
export async function user_bookmarks(user: string): Promise<INpoBookmark[]> {
  const bms = await get_bookmarks(user);
  const npos = await npos_batch_get(bms.map((x) => x.npo));
  const m = new Map(npos.map((n) => [n.id, n]));

  return bms.map((bm) => ({
    id: bm.npo,
    name: m.get(bm.npo)?.name ?? "",
    logo: m.get(bm.npo)?.logo ?? undefined,
  }));
}

export async function user_npos(user: string): Promise<IUserNpo2[]> {
  const unpos = await get_npos(user);
  const npos = await npos_batch_get(unpos.map((x) => x.id));
  const m = new Map(npos.map((n) => [n.id, n]));
  return unpos.map((x) => ({
    ...x,
    name: m.get(x.id)?.name ?? "",
    logo: m.get(x.id)?.logo ?? undefined,
  }));
}
