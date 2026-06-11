import type { ITo } from "@/donations";
import { fund_get } from "$/pg/queries/fund";
import { npo_get } from "$/pg/queries/npo";

/**
 * @param id - endow id or fund uuid
 * @param dynamo - dynamodb client that has access to the tables
 */
export async function to_fn(id: string | number): Promise<ITo | undefined> {
  //recipient is endowment
  if (typeof id === "number") {
    const npo = await npo_get(id);
    if (!npo) return undefined;
    if (npo.active === false) return undefined;
    const recipient: ITo = {
      to_id: id.toString(),
      to_type: "npo",
      to_name: npo.name,
      to_tip_allowed: !(npo.hide_bg_tip ?? false),
      to_members: [],
    };

    return recipient;
  }

  return fund_get(id).then((data) => {
    if (!data) return undefined;
    const recipient: ITo = {
      to_id: data.id,
      to_type: "fund",
      to_name: data.name,
      to_tip_allowed: !data.hide_bg_tip,
      to_members: data.members.map((n) => n.toString()),
    };
    return recipient;
  });
}
